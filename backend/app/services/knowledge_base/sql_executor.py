"""
SQL execution layer for the GoOneIn knowledge base.

Handles:
  - Safe read-only SQL execution via asyncpg against the ai_kb_reader role
  - Multi-layer security validation (regex + sqlglot AST)
  - Named parameter substitution (:user_id -> $1)
  - Automatic LIMIT injection when absent
  - Statement timeout enforcement (server-side SET LOCAL)
  - Row serialization (datetime, Decimal, UUID, vector -> JSON-safe types)
  - Result row limiting (never return unbounded datasets to LLM)

SECURITY MODEL:
  The database does most of the heavy lifting:
    - ai_kb_reader role has SELECT-only on safe tables, nothing on PII tables
    - ai_kb_reader has BYPASSRLS so aggregate queries work
    - All mutations fail at the privilege level before reaching this code
  This Python layer is defense-in-depth, not the primary control.

CONNECTION:
  Uses asyncpg directly — Supabase REST API does not expose raw SQL.
  Set AI_READONLY_DB_URL in .env to a connection string that authenticates
  as ai_kb_reader, or fall back to SUPABASE_DB_URL and SET ROLE at runtime.

  Recommended: transaction pooler (port 6543) since connections are short-lived.
  Format: postgresql://ai_kb_reader:<password>@<host>:6543/postgres
"""

import asyncpg
import asyncio
import logging
import re
import json
from datetime import datetime, date
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from app.core.config import get_settings

logger = logging.getLogger("KnowledgeBase.SQLExecutor")
settings = get_settings()

# ---------------------------------------------------------------------------
# Limits and timeouts
# ---------------------------------------------------------------------------

# Maximum rows returned to the LLM. Prevents token blowout.
# The HNSW similarity search hard-caps at 50 inside the RPC function.
# For raw SQL the wrapper enforces this at the Python level too.
MAX_RESULT_ROWS = 50

# Hard query timeout enforced both server-side (SET LOCAL statement_timeout)
# and client-side (asyncio.wait_for). The server-side timeout fires first
# for long-running queries; the client-side catches connection hangs.
# 8s is generous for aggregate queries on 100K rows but fast enough to
# surface runaway JSONB unnests before they saturate the connection pool.
QUERY_TIMEOUT_SECONDS = 8.0
QUERY_TIMEOUT_MS = int(QUERY_TIMEOUT_SECONDS * 1000)  # for SET LOCAL

# ---------------------------------------------------------------------------
# Security policy constants
# ---------------------------------------------------------------------------

# Only SELECT statements are permitted. CTEs (WITH ... SELECT) start with
# "with", so we allow that prefix too — the AST check below validates that
# the CTE body does not contain mutations.
ALLOWED_STATEMENT_PREFIXES = ("select", "with")

# Tables that must never appear in any query — checked by normalized text
# AND by sqlglot AST table extraction. The regex catches most cases; the
# AST check catches attempts to hide table names in subqueries or aliases.
FORBIDDEN_TABLES: frozenset[str] = frozenset({
    "user_resumes",
    "resume_analysis",
    "resume_analysis_queue",
    "user_settings",
    "user_configs",
    "ai_kb_sessions",
    "ai_kb_messages",
})

# Regex patterns for forbidden tables — catches schema-qualified forms too
# e.g. public.user_resumes, "user_resumes"
FORBIDDEN_TABLE_PATTERNS: list[str] = [
    r"\buser_resumes\b",
    r"\bresume_analysis\b",
    r"\bresume_analysis_queue\b",
    r"\buser_settings\b",
    r"\buser_configs\b",
    r"\bauth\s*\.\s*users\b",
    r"\bauth\s*\.\s*sessions\b",
    r"\bauth\s*\.\s*refresh_tokens\b",
    r"\bai_kb_sessions\b",
    r"\bai_kb_messages\b",
]

# Forbidden mutation/DDL keywords — checked on normalized SQL text.
# Note: these words can appear inside strings in legitimate SELECT queries
# (e.g. WHERE status = 'pending delete'). The AST check is the authoritative
# guard; this regex is a fast pre-filter that rejects obvious injections.
FORBIDDEN_KEYWORD_PATTERNS: list[str] = [
    r"(?<!['\"])(\bdelete\b)(?!['\"])",
    r"(?<!['\"])(\bupdate\b)(?!['\"])",
    r"(?<!['\"])(\binsert\b)(?!['\"])",
    r"(?<!['\"])(\bdrop\b)(?!['\"])",
    r"(?<!['\"])(\btruncate\b)(?!['\"])",
    r"(?<!['\"])(\balter\b)(?!['\"])",
    r"(?<!['\"])(\bcreate\b)(?!['\"])",
    r"(?<!['\"])(\bgrant\b)(?!['\"])",
    r"(?<!['\"])(\brevoke\b)(?!['\"])",
    r"(?<!['\"])(\bcopy\b)(?!['\"])",
    r"(?<!['\"])(\bexecute\b)(?!['\"])",
    r"(?<!['\"])(\bcall\b)(?!['\"])",
    r"\bpg_read_file\b",
    r"\bpg_ls_dir\b",
    r"\bpg_read_binary_file\b",
    r"\blo_import\b",
    r"\blo_export\b",
]

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class SQLSecurityError(Exception):
    """Raised when SQL fails the security validation gate. Never retry."""


class SQLExecutionError(Exception):
    """Raised when PostgreSQL rejects the query. The orchestrator may retry
    with AI-assisted correction."""
    def __init__(self, message: str, original_sql: str, pg_error: str):
        super().__init__(message)
        self.original_sql = original_sql
        self.pg_error = pg_error


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------


def _serialize_value(v: Any) -> Any:
    """Convert PostgreSQL types to JSON-serializable Python types."""
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, UUID):
        return str(v)
    if isinstance(v, memoryview):
        return v.tobytes().decode("utf-8", errors="replace")
    if isinstance(v, (list, tuple)):
        return [_serialize_value(i) for i in v]
    # asyncpg returns pgvector as a list of floats — no special handling needed
    return v


def _serialize_row(row: asyncpg.Record) -> dict[str, Any]:
    """Convert an asyncpg Record to a plain dict with JSON-safe values."""
    return {k: _serialize_value(v) for k, v in dict(row).items()}


# ---------------------------------------------------------------------------
# Security validation
# ---------------------------------------------------------------------------


def _validate_sql_regex(sql: str) -> None:
    """
    Fast regex pre-filter. Catches the obvious cases before hitting sqlglot.
    Raises SQLSecurityError on any violation.
    """
    normalized = sql.strip().lower()

    # Must start with SELECT or WITH (for CTEs)
    if not any(normalized.startswith(p) for p in ALLOWED_STATEMENT_PREFIXES):
        raise SQLSecurityError(
            f"Only SELECT statements are permitted. Statement starts with: "
            f"'{normalized[:60]}'"
        )

    # Forbidden table name patterns
    for pattern in FORBIDDEN_TABLE_PATTERNS:
        if re.search(pattern, normalized, re.IGNORECASE):
            raise SQLSecurityError(
                f"Query references a forbidden table. Pattern matched: {pattern}"
            )

    # Forbidden DML/DDL keyword patterns (fast reject, not authoritative)
    for pattern in FORBIDDEN_KEYWORD_PATTERNS:
        if re.search(pattern, normalized, re.IGNORECASE):
            raise SQLSecurityError(
                f"Forbidden SQL keyword detected. Pattern matched: {pattern}"
            )


def _validate_sql_ast(sql: str) -> None:
    """
    AST-level validation using sqlglot. More reliable than regex for catching
    obfuscated mutations (e.g. whitespace tricks, aliased table names,
    nested CTEs with mutations).

    If sqlglot is not installed, this check is skipped with a warning.
    The regex check + database role privileges still provide strong protection.
    """
    try:
        import sqlglot
        import sqlglot.expressions as exp
    except ImportError:
        logger.warning(
            "[SQLExecutor] sqlglot not installed — AST validation skipped. "
            "Install with: pip install sqlglot"
        )
        return

    try:
        parsed = sqlglot.parse(sql, dialect="postgres")
    except Exception as e:
        # Parse failure is treated as a security violation — malformed SQL
        # could indicate an injection attempt that confused the parser
        raise SQLSecurityError(f"SQL failed to parse (possible injection): {e}")

    for statement in parsed:
        if statement is None:
            continue

        # Only SELECT and CTE-backed SELECT are allowed
        if not isinstance(statement, (exp.Select, exp.With)):
            raise SQLSecurityError(
                f"Only SELECT statements are allowed. Got: {type(statement).__name__}"
            )

        # Walk the full AST and check every table reference
        for table_node in statement.find_all(exp.Table):
            table_name = table_node.name.lower() if table_node.name else ""
            if table_name in FORBIDDEN_TABLES:
                raise SQLSecurityError(
                    f"AST check: query references forbidden table '{table_name}'"
                )

        # Walk the full AST and check for any DML/DDL node types
        forbidden_node_types = (
            exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create,
            exp.AlterTable, exp.Grant, exp.Revoke, exp.Command,
            exp.Truncate,
        )
        for node in statement.walk():
            if isinstance(node, forbidden_node_types):
                raise SQLSecurityError(
                    f"AST check: forbidden operation '{type(node).__name__}' "
                    f"found inside query"
                )


def validate_sql_security(sql: str) -> None:
    """
    Full security validation pipeline. Call this before any database interaction.
    Layer 1: regex pre-filter (fast)
    Layer 2: sqlglot AST check (authoritative)
    Layer 3: database role privileges (enforced by PostgreSQL, final backstop)
    """
    _validate_sql_regex(sql)
    _validate_sql_ast(sql)


# ---------------------------------------------------------------------------
# Parameter substitution
# ---------------------------------------------------------------------------


def _substitute_named_params(
    sql: str, params: dict[str, Any]
) -> tuple[str, list[Any]]:
    """
    Convert named parameters (:name) to asyncpg positional parameters ($N).

    Handles repeated occurrences of the same parameter name — each unique
    name gets one positional slot, reused across multiple references.

    Example:
        Input:  "SELECT * FROM scraped_jobs WHERE user_id = :uid LIMIT :n",
                {"uid": "abc-123", "n": 10}
        Output: "SELECT * FROM scraped_jobs WHERE user_id = $1 LIMIT $2",
                ["abc-123", 10]

    Raises ValueError if a :param in the SQL has no matching key in params.
    """
    positional_values: list[Any] = []
    param_index_map: dict[str, int] = {}

    def replace_param(match: re.Match) -> str:
        name = match.group(1)
        if name not in params:
            raise ValueError(
                f"SQL references parameter ':{name}' but it was not provided. "
                f"Available params: {list(params.keys())}"
            )
        if name not in param_index_map:
            positional_values.append(params[name])
            param_index_map[name] = len(positional_values)
        return f"${param_index_map[name]}"

    converted_sql = re.sub(r":([a-zA-Z_][a-zA-Z0-9_]*)", replace_param, sql)
    return converted_sql, positional_values


# ---------------------------------------------------------------------------
# LIMIT injection
# ---------------------------------------------------------------------------

_LIMIT_RE = re.compile(r"\blimit\s+\d+", re.IGNORECASE)


def _inject_limit(sql: str, max_rows: int = MAX_RESULT_ROWS) -> str:
    """
    Wrap the SQL in a subquery with LIMIT if no LIMIT clause is already present.
    This prevents the LLM from accidentally returning the entire table.

    Existing LIMIT clauses are honored — if the LLM wrote LIMIT 5 we keep it
    (it will be enforced at the Python truncation step too, so it cannot exceed
    MAX_RESULT_ROWS regardless).
    """
    if not _LIMIT_RE.search(sql):
        return f"SELECT * FROM ({sql}) AS _kb_limited LIMIT {max_rows}"
    return sql


# ---------------------------------------------------------------------------
# Connection management
# ---------------------------------------------------------------------------


def _build_dsn() -> str:
    """
    Build the PostgreSQL DSN for asyncpg.

    Priority order:
      1. AI_READONLY_DB_URL — connection string for the ai_kb_reader role.
         This is the preferred option. The role has SELECT-only on safe tables.
         Use the Supabase transaction pooler (port 6543) for short-lived connections.
         Format: postgresql://ai_kb_reader:<password>@<host>:6543/postgres

      2. SUPABASE_DB_URL — the full service-role connection string. If used,
         we SET ROLE ai_kb_reader immediately after connecting (see execute_query).

    To get the transaction pooler URL:
      Supabase Dashboard -> Project Settings -> Database ->
      Connection string -> Transaction pooler URI
    """
    ai_url = getattr(settings, "AI_READONLY_DB_URL", None)
    if ai_url:
        return ai_url

    supa_url = getattr(settings, "SUPABASE_DB_URL", None)
    if supa_url:
        return supa_url

    raise RuntimeError(
        "Neither AI_READONLY_DB_URL nor SUPABASE_DB_URL is set in .env. "
        "Add one of these to enable NL2SQL queries. "
        "Recommended: AI_READONLY_DB_URL=postgresql://ai_kb_reader:<pw>@<host>:6543/postgres"
    )


def _needs_role_switch() -> bool:
    """
    Return True if we are connecting as service_role and need to
    SET ROLE ai_kb_reader at connection time.
    If AI_READONLY_DB_URL is set, the connection already authenticates
    as ai_kb_reader and no switch is needed.
    """
    return not bool(getattr(settings, "AI_READONLY_DB_URL", None))


# ---------------------------------------------------------------------------
# Core execution
# ---------------------------------------------------------------------------


async def execute_query(
    sql: str,
    params: Optional[dict[str, Any]] = None,
    timeout: float = QUERY_TIMEOUT_SECONDS,
) -> list[dict[str, Any]]:
    """
    Execute a validated read-only SQL query and return results as a list of dicts.

    Security pipeline (in order):
      1. _validate_sql_regex()    — fast pattern matching
      2. _validate_sql_ast()      — sqlglot AST node inspection
      3. _substitute_named_params() — safe parameterization
      4. _inject_limit()          — row cap injection
      5. SET LOCAL statement_timeout — server-side timeout
      6. SET ROLE ai_kb_reader    — role downgrade (if connecting as service_role)
      7. PostgreSQL privilege check — database-level backstop
      8. Python truncation        — final row cap before returning to LLM

    Args:
        sql:     SELECT statement. May use :named_param placeholders.
        params:  Dict mapping param names to values.
        timeout: Max execution time in seconds (default 8s).

    Returns:
        List of row dicts, at most MAX_RESULT_ROWS entries.

    Raises:
        SQLSecurityError:  Query failed validation. Do not retry.
        SQLExecutionError: PostgreSQL rejected the query. Orchestrator may retry
                           with AI-assisted SQL correction.
        RuntimeError:      Infrastructure failure (missing config, connection error).
    """
    params = params or {}

    # --- Layer 1 + 2: Security validation ---
    validate_sql_security(sql)

    # --- Layer 3: Parameter substitution ---
    positional_sql, positional_values = _substitute_named_params(sql, params)

    # --- Layer 4: LIMIT injection ---
    positional_sql = _inject_limit(positional_sql, MAX_RESULT_ROWS)

    dsn = _build_dsn()
    conn: Optional[asyncpg.Connection] = None

    try:
        # --- Layer 5: Connect (with timeout) ---
        try:
            conn = await asyncio.wait_for(
                asyncpg.connect(dsn=dsn),
                timeout=5.0,
            )
        except asyncio.TimeoutError:
            raise RuntimeError("Database connection timed out after 5s")
        except asyncpg.PostgresError as e:
            raise RuntimeError(f"Database connection failed: {e}")

        # --- Layer 6: Role switch (if connecting as service_role) ---
        if _needs_role_switch():
            await conn.execute("SET ROLE ai_kb_reader")

        # --- Layer 5 (server-side): Statement timeout ---
        # SET LOCAL scopes the timeout to this transaction only.
        # Even if the client disconnects, PostgreSQL enforces the timeout.
        await conn.execute(
            f"SET LOCAL statement_timeout = '{QUERY_TIMEOUT_MS}'"
        )

        # --- Execute ---
        try:
            rows = await asyncio.wait_for(
                conn.fetch(positional_sql, *positional_values),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            raise SQLExecutionError(
                f"Query timed out after {timeout}s",
                original_sql=sql,
                pg_error=f"TIMEOUT after {timeout} seconds",
            )
        except asyncpg.InsufficientPrivilegeError as e:
            # This fires when the LLM tries to read a PII table that isn't
            # granted to ai_kb_reader. Treat as security violation.
            raise SQLSecurityError(
                f"Query was blocked by database role privileges: {e}. "
                f"The table referenced may contain PII and is not accessible."
            )
        except asyncpg.PostgresError as e:
            raise SQLExecutionError(
                f"PostgreSQL error: {e}",
                original_sql=sql,
                pg_error=str(e),
            )

        # --- Layer 8: Python-side row cap ---
        result = [_serialize_row(r) for r in rows[:MAX_RESULT_ROWS]]

        logger.info(
            "[SQLExecutor] Query OK — %d rows returned (cap: %d). "
            "SQL: %.80s...",
            len(result),
            MAX_RESULT_ROWS,
            sql,
        )
        return result

    finally:
        if conn and not conn.is_closed():
            await conn.close()


async def execute_rpc(
    function_name: str,
    params: Optional[dict[str, Any]] = None,
    timeout: float = QUERY_TIMEOUT_SECONDS,
) -> list[dict[str, Any]]:
    """
    Call a Supabase RPC function by name and return results.

    Wraps the RPC call as a SELECT from a function call, which goes through
    the same security and row-limiting pipeline as execute_query.

    Only whitelisted functions can be called — this prevents the LLM from
    calling arbitrary functions like pg_read_file() or system functions.

    Args:
        function_name: One of the whitelisted RPC function names.
        params:        Keyword arguments for the function, or None.
        timeout:       Max execution time in seconds.

    Returns:
        List of row dicts.

    Raises:
        SQLSecurityError:  function_name not in whitelist.
        SQLExecutionError: PostgreSQL error during execution.
    """
    ALLOWED_RPC_FUNCTIONS: frozenset[str] = frozenset({
        # Analytics helpers (existing SECURITY DEFINER functions)
        "analytics_overview",
        "analytics_tech_skills",
        "analytics_good_to_have",
        "analytics_top_companies",
        "analytics_locations",
        "analytics_visa",
        "analytics_salary_strings",
        "analytics_qualifications",
        "analytics_timeline",
        "analytics_sources",
        "analytics_weekday",
        "analytics_hourly_distribution",
        "analytics_skill_cooccurrence",
        "analytics_queue_health",
        # New AI KB helpers
        "search_jobs_by_embedding",
        "search_jobs_by_keywords",
        "get_job_detail",
    })

    if function_name not in ALLOWED_RPC_FUNCTIONS:
        raise SQLSecurityError(
            f"RPC function '{function_name}' is not in the allowed list. "
            f"Allowed: {sorted(ALLOWED_RPC_FUNCTIONS)}"
        )

    # Build a SELECT * FROM function_name(...) SQL call
    if params:
        # Build named argument syntax: func(param1 => $1, param2 => $2)
        arg_parts = []
        positional_values = []
        for i, (k, v) in enumerate(params.items(), start=1):
            arg_parts.append(f"{k} => ${i}")
            positional_values.append(v)
        call_sql = (
            f"SELECT * FROM {function_name}({', '.join(arg_parts)})"
        )
    else:
        call_sql = f"SELECT * FROM {function_name}()"
        positional_values = []

    call_sql = _inject_limit(call_sql, MAX_RESULT_ROWS)

    dsn = _build_dsn()
    conn: Optional[asyncpg.Connection] = None

    try:
        conn = await asyncio.wait_for(asyncpg.connect(dsn=dsn), timeout=5.0)
        if _needs_role_switch():
            await conn.execute("SET ROLE ai_kb_reader")
        await conn.execute(f"SET LOCAL statement_timeout = '{QUERY_TIMEOUT_MS}'")

        try:
            rows = await asyncio.wait_for(
                conn.fetch(call_sql, *positional_values),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            raise SQLExecutionError(
                f"RPC call timed out after {timeout}s",
                original_sql=call_sql,
                pg_error=f"TIMEOUT after {timeout} seconds",
            )
        except asyncpg.PostgresError as e:
            raise SQLExecutionError(
                f"RPC error in {function_name}: {e}",
                original_sql=call_sql,
                pg_error=str(e),
            )

        result = [_serialize_row(r) for r in rows[:MAX_RESULT_ROWS]]
        logger.info(
            "[SQLExecutor] RPC %s() returned %d rows", function_name, len(result)
        )
        return result

    finally:
        if conn and not conn.is_closed():
            await conn.close()


# ---------------------------------------------------------------------------
# Result formatting
# ---------------------------------------------------------------------------


def format_results_for_llm(
    rows: list[dict[str, Any]],
    original_sql: str,
    max_rows_to_show: int = 30,
    max_string_length: int = 200,
) -> str:
    """
    Format SQL result rows into a compact text block for the LLM synthesizer.

    Truncates long string values to avoid token blowout. At 30 rows × 200 chars
    per string field, the worst case is ~15K characters — safe for a 128K context.

    Returns a multi-line string:
        SQL executed: SELECT ...
        Rows returned: N (showing first 30)
        Results:
        [{"col": "val", ...}, ...]
    """
    displayed_rows = rows[:max_rows_to_show]
    truncated = len(rows) > max_rows_to_show

    def truncate_row(row: dict) -> dict:
        out = {}
        for k, v in row.items():
            if isinstance(v, str) and len(v) > max_string_length:
                out[k] = v[:max_string_length - 3] + "..."
            elif isinstance(v, list) and len(v) > 20:
                # Truncate long arrays (e.g. must_have_keywords with 50 entries)
                out[k] = v[:20] + [f"... ({len(v) - 20} more)"]
            else:
                out[k] = v
        return out

    truncated_rows = [truncate_row(r) for r in displayed_rows]

    sql_preview = original_sql[:200] + ("..." if len(original_sql) > 200 else "")
    row_count_str = str(len(rows))
    if truncated:
        row_count_str += f" (showing first {max_rows_to_show})"

    lines = [
        f"SQL executed: {sql_preview}",
        f"Rows returned: {row_count_str}",
        "Results:",
        json.dumps(truncated_rows, indent=None, default=str, ensure_ascii=False),
    ]
    return "\n".join(lines)
