"""
Live schema introspection — queries the actual database for exact table/column info.

Called once at startup, cached in memory, and injected into the NL2SQL prompts.
This ensures the LLM always sees the real column names and data types,
eliminating schema drift between the codebase and the database.

Queries:
  - information_schema.columns  → tables and views
  - pg_catalog.pg_attribute     → materialized views (not in information_schema)
  - pg_catalog.pg_description   → column and table comments (if any)
"""

import asyncio
import logging
from typing import Any, Optional

import asyncpg

from app.core.config import get_settings

logger = logging.getLogger("KnowledgeBase.SchemaIntrospection")
settings = get_settings()

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

_cached_schema: Optional[str] = None
_cached_compact_schema: Optional[str] = None

# Tables the LLM is allowed to know about (everything else is hidden)
ALLOWED_TABLES: list[str] = [
    "scraped_jobs",
    "job_analysis_cache",
    "custom_sources",
    "custom_source_jobs",
    "saved_jobs",
    "job_analysis_queue",
]

ALLOWED_MATERIALIZED_VIEWS: list[str] = [
    "mv_skill_frequency",
    "mv_company_hiring_stats",
    "mv_salary_distribution",
]

# Human-written purpose descriptions per table (the DB won't have these)
TABLE_DESCRIPTIONS: dict[str, str] = {
    "scraped_jobs": (
        "Per-user job records. One row per (user_id, external_id) pair. "
        "Use for user-specific queries (saved count, user's visible jobs). "
        "DO NOT use for global statistics — use job_analysis_cache instead."
    ),
    "job_analysis_cache": (
        "Global cache of AI-analyzed jobs, one row per external_id across ALL users. "
        "Use for: salary distributions, skill frequency, visa stats, aggregate analysis. "
        "Does NOT contain user_id — it is shared across all users. "
        "WARNING: Does NOT have company, location, title, source, or work_model columns! "
        "To filter/group by those, JOIN with scraped_jobs on external_id."
    ),
    "custom_sources": (
        "User-configured job scraping sources (company career pages, ATS boards)."
    ),
    "custom_source_jobs": (
        "Jobs found from custom sources. Per-user, not in scraped_jobs."
    ),
    "saved_jobs": "User's saved/bookmarked jobs.",
    "job_analysis_queue": "Queue for pending AI analysis jobs. Status tracking only.",
}

MV_DESCRIPTIONS: dict[str, str] = {
    "mv_skill_frequency": "Pre-aggregated skill counts from all completed analyses. Refreshed after each batch.",
    "mv_company_hiring_stats": "Pre-aggregated company hiring statistics. Has company name, job counts, locations array, visa/salary mention percentages.",
    "mv_salary_distribution": "Salary bucketed distribution with ranges and sample values.",
}


# ---------------------------------------------------------------------------
# DSN helper (reuses the same logic as sql_executor)
# ---------------------------------------------------------------------------

def _build_dsn() -> Optional[str]:
    supa_url = getattr(settings, "SUPABASE_DB_URL", None)
    if supa_url:
        return supa_url
    ai_url = getattr(settings, "AI_READONLY_DB_URL", None)
    if ai_url:
        return ai_url
    return None


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

# Fetch columns for regular tables
TABLES_QUERY = """
SELECT
    c.table_name,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default,
    c.ordinal_position,
    pgd.description AS column_comment
FROM information_schema.columns c
LEFT JOIN pg_catalog.pg_statio_all_tables st
    ON st.relname = c.table_name AND st.schemaname = c.table_schema
LEFT JOIN pg_catalog.pg_description pgd
    ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
WHERE c.table_schema = 'public'
    AND c.table_name = ANY($1)
ORDER BY c.table_name, c.ordinal_position
"""

# Fetch columns for materialized views (not in information_schema)
MV_QUERY = """
SELECT
    cls.relname AS table_name,
    att.attname AS column_name,
    pg_catalog.format_type(att.atttypid, att.atttypmod) AS data_type,
    att.attnum AS ordinal_position,
    d.description AS column_comment
FROM pg_catalog.pg_attribute att
JOIN pg_catalog.pg_class cls ON att.attrelid = cls.oid
JOIN pg_catalog.pg_namespace nsp ON cls.relnamespace = nsp.oid
LEFT JOIN pg_catalog.pg_description d
    ON d.objoid = cls.oid AND d.objsubid = att.attnum
WHERE nsp.nspname = 'public'
    AND cls.relkind = 'm'
    AND cls.relname = ANY($1)
    AND att.attnum > 0
    AND NOT att.attisdropped
ORDER BY cls.relname, att.attnum
"""


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------

def _pg_type_display(data_type: str, udt_name: str = "") -> str:
    """Convert PostgreSQL type names to concise display strings."""
    mapping = {
        "character varying": "VARCHAR",
        "timestamp with time zone": "TIMESTAMPTZ",
        "timestamp without time zone": "TIMESTAMP",
        "boolean": "BOOLEAN",
        "integer": "INT",
        "bigint": "BIGINT",
        "smallint": "SMALLINT",
        "text": "TEXT",
        "uuid": "UUID",
        "jsonb": "JSONB",
        "json": "JSON",
        "numeric": "NUMERIC",
        "double precision": "FLOAT8",
        "real": "FLOAT4",
        "date": "DATE",
        "ARRAY": "ARRAY",
        "USER-DEFINED": udt_name.upper() if udt_name else "USER-DEFINED",
    }
    return mapping.get(data_type, data_type.upper())


def _format_table_schema(
    table_name: str,
    columns: list[dict[str, Any]],
    description: str,
    is_mv: bool = False,
) -> str:
    """Format a single table's schema as a text block for the LLM."""
    kind = "MATERIALIZED VIEW" if is_mv else "TABLE"
    lines = [f"{kind}: {table_name}"]
    if description:
        lines.append(f"PURPOSE: {description}")
    lines.append("COLUMNS:")

    for col in columns:
        col_name = col["column_name"]
        if is_mv:
            type_str = col["data_type"].upper()
        else:
            type_str = _pg_type_display(col["data_type"], col.get("udt_name", ""))

        nullable = ""
        if not is_mv and col.get("is_nullable") == "NO":
            nullable = " NOT NULL"

        comment = ""
        if col.get("column_comment"):
            comment = f"  -- {col['column_comment']}"

        lines.append(f"  {col_name:<24} {type_str}{nullable}{comment}")

    return "\n".join(lines)


def _format_compact_table(table_name: str, columns: list[dict[str, Any]], is_mv: bool = False) -> str:
    """One-liner format: table_name(col1 TYPE, col2 TYPE, ...)"""
    parts = []
    for col in columns:
        col_name = col["column_name"]
        if is_mv:
            type_str = col["data_type"].upper()
        else:
            type_str = _pg_type_display(col["data_type"], col.get("udt_name", ""))
        parts.append(f"{col_name} {type_str}")
    return f"{table_name}({', '.join(parts)})"


# ---------------------------------------------------------------------------
# Core: fetch and format
# ---------------------------------------------------------------------------

async def _fetch_from_db() -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    """
    Connect to the database and fetch column metadata for all allowed
    tables and materialized views.

    Tries asyncpg first, falls back to Supabase REST API.
    Returns (tables_dict, mv_dict) where each maps table_name -> list of column dicts.
    """
    # Try asyncpg first
    try:
        return await _fetch_via_asyncpg()
    except Exception as e:
        logger.warning(f"[SchemaIntrospection] asyncpg failed ({e}), trying REST fallback")

    # Fallback: REST API via ai_kb_exec_sql RPC
    return await _fetch_via_rest()


async def _fetch_via_asyncpg() -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    """Fetch schema via asyncpg direct connection."""
    dsn = _build_dsn()
    if not dsn:
        raise RuntimeError("No database URL configured")

    conn = await asyncio.wait_for(asyncpg.connect(dsn=dsn), timeout=10.0)
    try:
        await conn.execute("SET search_path TO public, extensions")

        table_rows = await conn.fetch(TABLES_QUERY, ALLOWED_TABLES)
        tables: dict[str, list[dict]] = {}
        for row in table_rows:
            tn = row["table_name"]
            tables.setdefault(tn, []).append(dict(row))

        mv_rows = await conn.fetch(MV_QUERY, ALLOWED_MATERIALIZED_VIEWS)
        mvs: dict[str, list[dict]] = {}
        for row in mv_rows:
            tn = row["table_name"]
            mvs.setdefault(tn, []).append(dict(row))

        return tables, mvs
    finally:
        await conn.close()


async def _fetch_via_rest() -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    """Fetch schema via Supabase REST API using ai_kb_exec_sql RPC."""
    import httpx

    supabase_url = settings.SUPABASE_URL
    service_key = settings.SUPABASE_SERVICE_KEY
    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY required for REST fallback")

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    table_list = ", ".join(f"''{t}''" for t in ALLOWED_TABLES)
    tables_sql = (
        f"SELECT c.table_name, c.column_name, c.data_type, c.udt_name, "
        f"c.is_nullable, c.ordinal_position "
        f"FROM information_schema.columns c "
        f"WHERE c.table_schema = ''public'' "
        f"AND c.table_name IN ({table_list}) "
        f"ORDER BY c.table_name, c.ordinal_position"
    )

    mv_list = ", ".join(f"''{m}''" for m in ALLOWED_MATERIALIZED_VIEWS)
    mv_sql = (
        f"SELECT cls.relname AS table_name, att.attname AS column_name, "
        f"pg_catalog.format_type(att.atttypid, att.atttypmod) AS data_type, "
        f"att.attnum AS ordinal_position "
        f"FROM pg_catalog.pg_attribute att "
        f"JOIN pg_catalog.pg_class cls ON att.attrelid = cls.oid "
        f"JOIN pg_catalog.pg_namespace nsp ON cls.relnamespace = nsp.oid "
        f"WHERE nsp.nspname = ''public'' AND cls.relkind = ''m'' "
        f"AND cls.relname IN ({mv_list}) "
        f"AND att.attnum > 0 AND NOT att.attisdropped "
        f"ORDER BY cls.relname, att.attnum"
    )

    async with httpx.AsyncClient(timeout=15) as client:
        # Fetch table columns
        resp = await client.post(
            f"{supabase_url}/rest/v1/rpc/ai_kb_exec_sql",
            headers=headers,
            json={"sql_text": tables_sql.replace("''", "'")},
        )
        table_rows = resp.json() if resp.status_code == 200 else []

        # Fetch MV columns
        resp2 = await client.post(
            f"{supabase_url}/rest/v1/rpc/ai_kb_exec_sql",
            headers=headers,
            json={"sql_text": mv_sql.replace("''", "'")},
        )
        mv_rows = resp2.json() if resp2.status_code == 200 else []

    tables: dict[str, list[dict]] = {}
    for row in table_rows:
        tn = row["table_name"]
        tables.setdefault(tn, []).append(row)

    mvs: dict[str, list[dict]] = {}
    for row in mv_rows:
        tn = row["table_name"]
        mvs.setdefault(tn, []).append(row)

    return tables, mvs


def _build_full_schema(
    tables: dict[str, list[dict]],
    mvs: dict[str, list[dict]],
) -> str:
    """Build the full schema context string from live DB metadata."""
    sections = []

    # Tables
    for tn in ALLOWED_TABLES:
        cols = tables.get(tn, [])
        if not cols:
            continue
        desc = TABLE_DESCRIPTIONS.get(tn, "")
        sections.append(_format_table_schema(tn, cols, desc))

    # Materialized views
    for mv in ALLOWED_MATERIALIZED_VIEWS:
        cols = mvs.get(mv, [])
        if not cols:
            continue
        desc = MV_DESCRIPTIONS.get(mv, "")
        sections.append(_format_table_schema(mv, cols, desc, is_mv=True))

    return "\n\n---\n\n".join(sections)


def _build_compact_schema(
    tables: dict[str, list[dict]],
    mvs: dict[str, list[dict]],
) -> str:
    """Build the compact one-liner schema for the classifier prompt."""
    lines = ["Tables available (PostgreSQL/Supabase) — ONLY use columns listed here:"]

    for tn in ALLOWED_TABLES:
        cols = tables.get(tn, [])
        if not cols:
            continue
        note = ""
        if tn == "job_analysis_cache":
            note = " -- global, no user_id. NO company/location/title columns! JOIN scraped_jobs for those."
        lines.append(f"- {_format_compact_table(tn, cols)}{note}")

    lines.append("")
    lines.append("Materialized views (use these first — faster, pre-filtered):")
    for mv in ALLOWED_MATERIALIZED_VIEWS:
        cols = mvs.get(mv, [])
        if not cols:
            continue
        lines.append(f"- {_format_compact_table(mv, cols, is_mv=True)}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def refresh_schema_cache() -> bool:
    """
    Fetch live schema from the database and cache it.
    Call this once at startup. Returns True on success.
    """
    global _cached_schema, _cached_compact_schema

    try:
        tables, mvs = await _fetch_from_db()

        _cached_schema = _build_full_schema(tables, mvs)
        _cached_compact_schema = _build_compact_schema(tables, mvs)

        table_count = len(tables)
        mv_count = len(mvs)
        total_cols = sum(len(c) for c in tables.values()) + sum(len(c) for c in mvs.values())
        logger.info(
            f"[SchemaIntrospection] Live schema cached: "
            f"{table_count} tables, {mv_count} MVs, {total_cols} total columns"
        )
        return True

    except Exception as e:
        logger.warning(
            f"[SchemaIntrospection] Failed to fetch live schema: {e}. "
            "Falling back to static schema."
        )
        return False


def get_live_schema() -> Optional[str]:
    """Return the cached full schema, or None if not yet fetched."""
    return _cached_schema


def get_live_compact_schema() -> Optional[str]:
    """Return the cached compact schema, or None if not yet fetched."""
    return _cached_compact_schema
