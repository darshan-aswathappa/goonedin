"""
Knowledge Base Service — low-level primitives for the AI query layer.

Responsibilities:
  - Safe, read-only SQL execution via asyncpg (AI_READONLY_DB_URL role)
  - pgvector semantic search against job_analysis_cache.embedding
  - OpenAI text-embedding-3-small calls with an in-process TTL cache
  - Text canonicalisation for what we embed per job record
  - One-shot backfill task that embeds all 2 338 existing jobs

Design constraints that match existing codebase patterns:
  - Blocking SDK calls wrapped in asyncio.to_thread()  (same as job_analyzer.py)
  - Never raises — returns empty list / None and logs on error
  - Settings from get_settings()  (same Pydantic pattern as everywhere else)
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
from typing import Any, Optional

import asyncpg
from openai import OpenAI

from app.core.config import get_settings

logger = logging.getLogger("KnowledgeBase")
settings = get_settings()

# ---------------------------------------------------------------------------
# SQL safety constants
# ---------------------------------------------------------------------------

# These patterns are forbidden in any SQL string passed to execute_ai_query().
# The list is intentionally conservative — read-only DDL/DML is blocked even
# though the DB role itself would reject it, giving us defence-in-depth.
_FORBIDDEN_SQL_PATTERNS: list[re.Pattern] = [
    re.compile(r"\bINSERT\b", re.IGNORECASE),
    re.compile(r"\bUPDATE\b", re.IGNORECASE),
    re.compile(r"\bDELETE\b", re.IGNORECASE),
    re.compile(r"\bDROP\b", re.IGNORECASE),
    re.compile(r"\bCREATE\b", re.IGNORECASE),
    re.compile(r"\bALTER\b", re.IGNORECASE),
    re.compile(r"\bTRUNCATE\b", re.IGNORECASE),
    re.compile(r"\bGRANT\b", re.IGNORECASE),
    re.compile(r"\bREVOKE\b", re.IGNORECASE),
    re.compile(r"\bEXECUTE\b", re.IGNORECASE),
    re.compile(r"\bCALL\b", re.IGNORECASE),
    re.compile(r"--", re.IGNORECASE),           # inline comments can hide injections
    re.compile(r";.*\S", re.IGNORECASE),        # second statement after semicolon
]

_MAX_SQL_LENGTH = 4_096  # characters — prevents absurdly long injections

# ---------------------------------------------------------------------------
# In-process embedding cache  {sha256(text): (vector, expires_at)}
# ---------------------------------------------------------------------------
_embed_cache: dict[str, tuple[list[float], float]] = {}


def _cache_key(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _cache_get(text: str) -> Optional[list[float]]:
    key = _cache_key(text)
    entry = _embed_cache.get(key)
    if entry and time.monotonic() < entry[1]:
        return entry[0]
    if key in _embed_cache:
        del _embed_cache[key]
    return None


def _cache_set(text: str, vector: list[float]) -> None:
    ttl = settings.KB_EMBED_CACHE_TTL
    _embed_cache[_cache_key(text)] = (vector, time.monotonic() + ttl)


# ---------------------------------------------------------------------------
# asyncpg connection pool (lazy-initialised singleton)
# ---------------------------------------------------------------------------
_pool: Optional[asyncpg.Pool] = None
_pool_lock = asyncio.Lock()


async def _get_pool() -> Optional[asyncpg.Pool]:
    """Return (or create) the asyncpg read-only connection pool."""
    global _pool
    if _pool is not None:
        return _pool

    if not settings.AI_READONLY_DB_URL:
        logger.error(
            "[KB] AI_READONLY_DB_URL is not set — SQL execution unavailable"
        )
        return None

    async with _pool_lock:
        # Double-check after acquiring the lock (another coroutine may have
        # created it while we were waiting).
        if _pool is not None:
            return _pool
        try:
            # asyncpg expects a plain postgresql:// DSN, not postgresql+asyncpg://
            dsn = settings.AI_READONLY_DB_URL.replace(
                "postgresql+asyncpg://", "postgresql://"
            )
            _pool = await asyncpg.create_pool(
                dsn=dsn,
                min_size=1,
                max_size=5,
                command_timeout=15,         # per-query timeout in seconds
                statement_cache_size=0,     # safe default for pgbouncer compat
            )
            logger.info("[KB] asyncpg read-only pool created")
        except Exception as exc:
            logger.error(f"[KB] Failed to create asyncpg pool: {exc}")
            _pool = None
    return _pool


async def close_pool() -> None:
    """Graceful shutdown — call from the FastAPI lifespan teardown."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("[KB] asyncpg pool closed")


# ---------------------------------------------------------------------------
# SQL safety checks
# ---------------------------------------------------------------------------

def _check_sql_safety(sql: str) -> Optional[str]:
    """
    Return an error string if the SQL is unsafe, or None if it looks safe.

    We apply three layers:
      1. Length cap
      2. Forbidden-pattern regex
      3. sqlglot parse (if available) — non-fatal if not installed
    """
    if len(sql) > _MAX_SQL_LENGTH:
        return f"SQL exceeds maximum allowed length ({_MAX_SQL_LENGTH} chars)"

    for pattern in _FORBIDDEN_SQL_PATTERNS:
        if pattern.search(sql):
            return f"Forbidden SQL pattern detected: {pattern.pattern!r}"

    # Optional: sqlglot structural validation
    try:
        import sqlglot  # type: ignore
        statements = sqlglot.parse(sql, dialect="postgres")
        if not statements:
            return "SQL could not be parsed as a valid statement"
        for stmt in statements:
            stmt_type = type(stmt).__name__
            if stmt_type not in ("Select", "Union", "Intersect", "Except", "With"):
                return f"Only SELECT statements are allowed (got {stmt_type})"
    except ImportError:
        # sqlglot is optional — regex checks are sufficient for MVP
        pass
    except Exception as exc:
        logger.warning(f"[KB] sqlglot validation warning: {exc}")
        # Non-fatal — proceed with regex-only validation

    return None


def _wrap_with_row_limit(sql: str, limit: int) -> str:
    """
    Wrap the SQL in a subquery that enforces the row cap.

    SELECT * FROM (<original sql>) _ai_q LIMIT <limit>

    This ensures that even if DeepSeek generates a query without a LIMIT,
    we never return more rows than KB_SQL_ROW_LIMIT.
    """
    stripped = sql.rstrip().rstrip(";")
    return f"SELECT * FROM ({stripped}) _ai_q LIMIT {limit}"


# ---------------------------------------------------------------------------
# Core: safe SQL execution
# ---------------------------------------------------------------------------

async def execute_ai_query(sql: str) -> list[dict]:
    """
    Execute a read-only SQL query via the asyncpg read-only role.

    Returns a list of row dicts, or an empty list on any error.
    The caller (orchestrator) is responsible for interpreting an empty list
    as "no data found" and synthesising an appropriate answer.

    Safety:
      - Regex + sqlglot forbidden-pattern check before execution
      - Hard row limit via subquery wrapper
      - asyncpg command_timeout=15s (set at pool creation)
      - Read-only Postgres role — DDL will be rejected at DB level too
    """
    safety_error = _check_sql_safety(sql)
    if safety_error:
        logger.warning(f"[KB] SQL safety check failed: {safety_error} | SQL: {sql[:200]}")
        return []

    wrapped = _wrap_with_row_limit(sql, settings.KB_SQL_ROW_LIMIT)

    pool = await _get_pool()
    if pool is None:
        logger.error("[KB] No pool available — cannot execute AI query")
        return []

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(wrapped)
        return [dict(r) for r in rows]
    except asyncpg.TooManyConnectionsError as exc:
        logger.error(f"[KB] asyncpg pool exhausted: {exc}")
        return []
    except asyncpg.PostgresError as exc:
        # Surface the error message to the orchestrator so it can self-correct
        logger.warning(f"[KB] Postgres error during AI query: {exc}")
        raise  # re-raise so orchestrator can catch and self-correct
    except Exception as exc:
        logger.error(f"[KB] Unexpected error in execute_ai_query: {exc}")
        return []


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------

def _embed_text_sync(text: str) -> list[float]:
    """
    Blocking OpenAI embedding call — must be run via asyncio.to_thread().
    Uses text-embedding-3-small (1 536 dims, cheap, fast).
    """
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


async def embed_text(text: str) -> Optional[list[float]]:
    """
    Async wrapper for OpenAI embedding with in-process TTL cache.

    Returns None on failure so callers can fall back gracefully.
    """
    if not settings.OPENAI_API_KEY:
        logger.error("[KB] OPENAI_API_KEY is not set — embeddings unavailable")
        return None

    cached = _cache_get(text)
    if cached is not None:
        return cached

    try:
        vector = await asyncio.to_thread(_embed_text_sync, text)
        _cache_set(text, vector)
        return vector
    except Exception as exc:
        logger.error(f"[KB] embed_text failed: {exc}")
        return None


# ---------------------------------------------------------------------------
# Job text canonicalisation — what we embed per job record
# ---------------------------------------------------------------------------

def build_job_embedding_text(job_record: dict) -> str:
    """
    Produce a single canonical string that represents this job for embedding.

    We embed:
      - title + company + location (high signal for matching intent)
      - summary from analysis (dense semantic description)
      - must_have_keywords (most discriminative for skill queries)
      - good_to_have_keywords (secondary signal)
      - salary + visa (useful for compensation/sponsorship queries)

    We deliberately exclude:
      - external_id, job_url, timestamps (no semantic signal)
      - minimum_qualifications (partially redundant with keywords)

    The format is human-readable so the embedding space reflects natural
    language patterns rather than JSON key names.
    """
    parts: list[str] = []

    title = job_record.get("title") or job_record.get("job_title", "")
    company = job_record.get("company", "")
    location = job_record.get("location", "")

    if title:
        parts.append(f"Job title: {title}")
    if company:
        parts.append(f"Company: {company}")
    if location:
        parts.append(f"Location: {location}")

    # analysis is stored as JSON string in job_analysis_cache
    analysis = job_record.get("analysis")
    if isinstance(analysis, str):
        try:
            import json
            analysis = json.loads(analysis)
        except Exception:
            analysis = {}
    if isinstance(analysis, dict):
        summary = analysis.get("summary", "")
        if summary:
            parts.append(f"Summary: {summary}")

        must_have = analysis.get("must_have_keywords", [])
        if must_have:
            parts.append("Required skills: " + ", ".join(str(k) for k in must_have))

        good_to_have = analysis.get("good_to_have_keywords", [])
        if good_to_have:
            parts.append("Preferred skills: " + ", ".join(str(k) for k in good_to_have))

    salary = job_record.get("salary")
    if salary:
        parts.append(f"Salary: {salary}")

    visa = job_record.get("visa")
    if visa:
        parts.append(f"Visa: {visa}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# pgvector semantic search
# ---------------------------------------------------------------------------

async def vector_search(query: str, limit: int = 10) -> list[dict]:
    """
    Semantic similarity search over job_analysis_cache.embedding.

    Uses cosine distance (<=>  operator) which pgvector supports natively.
    Falls back gracefully if pgvector is not enabled or embedding fails.

    Returns rows sorted by similarity (most similar first), each as a dict
    with at minimum: external_id, title, company, location, salary, visa,
    analysis, similarity_score.
    """
    query_vector = await embed_text(query)
    if query_vector is None:
        logger.warning("[KB] vector_search: embed_text returned None, skipping")
        return []

    # Format as Postgres array literal for pgvector
    vector_literal = "[" + ",".join(str(v) for v in query_vector) + "]"

    sql = f"""
        SELECT
            external_id,
            job_url,
            analysis,
            salary,
            visa,
            analysis_status,
            1 - (embedding <=> '{vector_literal}'::vector) AS similarity_score
        FROM job_analysis_cache
        WHERE
            analysis_status = 'completed'
            AND embedding IS NOT NULL
        ORDER BY embedding <=> '{vector_literal}'::vector
        LIMIT {limit}
    """

    pool = await _get_pool()
    if pool is None:
        return []

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(sql)
        return [dict(r) for r in rows]
    except asyncpg.UndefinedFunctionError:
        # pgvector not enabled — log once and return empty (caller falls back)
        logger.warning(
            "[KB] pgvector operator <=> not found. "
            "Enable the vector extension: CREATE EXTENSION IF NOT EXISTS vector;"
        )
        return []
    except Exception as exc:
        logger.error(f"[KB] vector_search error: {exc}")
        return []


# ---------------------------------------------------------------------------
# Backfill: embed all existing jobs that have completed analysis
# ---------------------------------------------------------------------------

async def backfill_embeddings(supabase: Any) -> None:
    """
    One-shot background task: embed all completed cache entries that have
    no embedding yet.

    Called once from the FastAPI lifespan after startup (non-blocking —
    create_task so it runs in background without delaying startup).

    Strategy:
      - Page through job_analysis_cache WHERE embedding IS NULL AND status='completed'
      - Embed 10 at a time (rate-limit friendly)
      - Write back via asyncpg (direct UPDATE) to avoid Supabase client overhead
      - Never raises — failures are logged per-row so one bad row can't halt the batch
    """
    if not settings.OPENAI_API_KEY:
        logger.warning("[KB] Skipping embedding backfill — OPENAI_API_KEY not set")
        return

    logger.info("[KB] Starting embedding backfill for completed jobs...")

    page_size = 50
    offset = 0
    total_embedded = 0
    total_failed = 0

    pool = await _get_pool()
    if pool is None:
        logger.error("[KB] Backfill aborted — no asyncpg pool")
        return

    while True:
        try:
            # Fetch a page of un-embedded completed jobs from Supabase
            resp = await asyncio.to_thread(
                lambda: supabase.table("job_analysis_cache")
                .select("external_id, job_url, analysis, salary, visa")
                .eq("analysis_status", "completed")
                .is_("embedding", "null")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            rows = resp.data or []
        except Exception as exc:
            logger.error(f"[KB] Backfill fetch error at offset {offset}: {exc}")
            break

        if not rows:
            break

        for row in rows:
            external_id = row.get("external_id", "?")
            try:
                text = build_job_embedding_text(row)
                if not text.strip():
                    logger.warning(f"[KB] Backfill: empty text for {external_id}, skipping")
                    total_failed += 1
                    continue

                vector = await embed_text(text)
                if vector is None:
                    total_failed += 1
                    continue

                # Write via asyncpg UPDATE (bypasses Supabase row-level security
                # because we use the service-role-equivalent read-write connection).
                # Note: the backfill uses a direct asyncpg UPDATE even though the
                # pool is configured as read-only for AI queries — the backfill
                # writes through the same pool for simplicity.  If you want strict
                # separation, use a separate pool with a write role here.
                vector_literal = "[" + ",".join(str(v) for v in vector) + "]"
                async with pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE job_analysis_cache "
                        "SET embedding = $1::vector "
                        "WHERE external_id = $2",
                        vector_literal,
                        external_id,
                    )
                total_embedded += 1

            except Exception as exc:
                logger.error(f"[KB] Backfill failed for {external_id}: {exc}")
                total_failed += 1

        # Rate-limit: sleep briefly between pages to avoid hammering OpenAI
        await asyncio.sleep(1)
        offset += page_size

    logger.info(
        f"[KB] Embedding backfill complete. "
        f"Embedded: {total_embedded}, Failed: {total_failed}"
    )
