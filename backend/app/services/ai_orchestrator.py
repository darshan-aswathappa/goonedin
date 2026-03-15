"""
AI Orchestrator — the brain of the Knowledge Base feature.

Ties together:
  - NL-to-SQL generation  (DeepSeek, same AsyncOpenAI pattern as job_analyzer.py)
  - pgvector semantic search  (knowledge_base_service.vector_search)
  - Read-only SQL execution   (knowledge_base_service.execute_ai_query)
  - Streaming answer synthesis (DeepSeek streaming)
  - Conversation history management (in-process dict, keyed by session_id)

Execution flow for one user question:
  1. classify_and_plan()  → QueryPlan  (strategy + generated SQL)
  2. execute_plan()        → raw data dict
  3. synthesize_answer()  → AsyncIterator[str]  (streamed tokens)

The router drives these three steps and emits SSE events between them
so the frontend sees status updates before the first answer token arrives.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, AsyncIterator, Optional

import asyncpg
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.models.knowledge_base import (
    ConversationTurn,
    QueryPlan,
    QueryStrategy,
)
from app.services.knowledge_base_service import (
    execute_ai_query,
    vector_search,
)

logger = logging.getLogger("AIOrchestrator")
settings = get_settings()

# ---------------------------------------------------------------------------
# Conversation history store
# {session_id: {"turns": [ConversationTurn, ...], "last_access": float}}
# ---------------------------------------------------------------------------
_sessions: dict[str, dict] = {}
_SESSION_TTL_SECONDS = 60 * 60  # 1 hour idle expiry
_MAX_HISTORY_TURNS = 20         # keep last 20 turns per session to stay inside context window


def _prune_sessions() -> None:
    """Evict sessions idle for more than _SESSION_TTL_SECONDS."""
    now = time.monotonic()
    stale = [sid for sid, s in _sessions.items() if now - s["last_access"] > _SESSION_TTL_SECONDS]
    for sid in stale:
        del _sessions[sid]


def create_session() -> str:
    _prune_sessions()
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {"turns": [], "last_access": time.monotonic()}
    return session_id


def get_session_turns(session_id: str) -> list[ConversationTurn]:
    session = _sessions.get(session_id)
    if not session:
        return []
    session["last_access"] = time.monotonic()
    return list(session["turns"])


def append_turn(session_id: str, role: str, content: str) -> None:
    if session_id not in _sessions:
        _sessions[session_id] = {"turns": [], "last_access": time.monotonic()}
    turns = _sessions[session_id]["turns"]
    turns.append(ConversationTurn(role=role, content=content))
    # Rolling window: keep last N turns to avoid context-window overflow
    if len(turns) > _MAX_HISTORY_TURNS:
        _sessions[session_id]["turns"] = turns[-_MAX_HISTORY_TURNS:]
    _sessions[session_id]["last_access"] = time.monotonic()


def delete_session(session_id: str) -> bool:
    if session_id in _sessions:
        del _sessions[session_id]
        return True
    return False


# ---------------------------------------------------------------------------
# DeepSeek async client — reuse existing pattern from job_analyzer.py
# (AsyncOpenAI pointed at DeepSeek base_url)
# ---------------------------------------------------------------------------

def _get_deepseek_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=settings.DEEPSEEK_API_KEY,
        base_url="https://api.deepseek.com",
    )


# ---------------------------------------------------------------------------
# Database schema context injected into every planning prompt
# ---------------------------------------------------------------------------

_SCHEMA_CONTEXT = """
You have access to a PostgreSQL database with these relevant tables.

TABLE: scraped_jobs
  id            BIGSERIAL PRIMARY KEY
  user_id       UUID         -- owner
  external_id   TEXT         -- LinkedIn / GitHub / MathWorks job ID
  title         TEXT
  company       TEXT
  location      TEXT
  source        TEXT         -- 'linkedin' | 'github' | 'mathworks' | 'greenhouse' | 'custom'
  job_url       TEXT
  salary        TEXT         -- nullable, raw string e.g. "$120k - $160k"
  visa          TEXT         -- nullable, e.g. "Not eligible for sponsorship"
  analysis      JSONB        -- nullable, DeepSeek output (must_have_keywords etc.)
  is_visible    BOOLEAN
  is_dismissed  BOOLEAN
  posted_at     TIMESTAMPTZ
  created_at    TIMESTAMPTZ

TABLE: job_analysis_cache
  external_id      TEXT PRIMARY KEY
  job_url          TEXT
  analysis         TEXT        -- JSON string: {must_have_keywords, good_to_have_keywords, summary, ...}
  analysis_status  TEXT        -- 'pending' | 'processing' | 'completed' | 'unavailable'
  salary           TEXT
  visa             TEXT
  analyzed_at      TIMESTAMPTZ
  embedding        VECTOR(1536) -- pgvector, nullable until backfill runs

TABLE: custom_jobs
  id           BIGSERIAL PRIMARY KEY
  user_id      UUID
  source_id    UUID
  external_id  TEXT
  title        TEXT
  company      TEXT
  location     TEXT
  job_url      TEXT
  salary       TEXT
  posted_at    TIMESTAMPTZ
  is_visible   BOOLEAN
  is_dismissed BOOLEAN

TABLE: saved_jobs
  id          BIGSERIAL PRIMARY KEY
  user_id     UUID
  external_id TEXT
  saved_at    TIMESTAMPTZ

IMPORTANT RULES:
- Only generate SELECT statements.
- Never use INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, or GRANT.
- Always add a LIMIT clause (max 500 rows).
- Use job_analysis_cache for keyword/skill/salary/compensation analytics because it covers
  all users' jobs de-duplicated by external_id.
- Use scraped_jobs when user-specific visibility, dismissal, or source filtering is needed.
- For text search in JSON: use analysis::jsonb->>'summary' or analysis::jsonb->'must_have_keywords'.
- Return only the raw SQL with no markdown fences or explanation.
"""

# ---------------------------------------------------------------------------
# Step 1 — classify_and_plan
# ---------------------------------------------------------------------------

_CLASSIFICATION_PROMPT = f"""{_SCHEMA_CONTEXT}

You are a data analyst assistant for a job-tracking platform.  Given the user's question
and conversation history, produce a JSON plan with these keys:
  "strategy":     one of "sql_only" | "vector_only" | "hybrid" | "chitchat"
  "sql":          a valid PostgreSQL SELECT (or null if not needed)
  "vector_query": a plain-English search phrase for semantic search (or null)
  "rationale":    1 sentence explaining your choice

Strategy selection rules:
  - "sql_only"    for aggregations, counts, filters, salary ranges, date ranges,
                  top-N companies, keyword frequency, visa sponsorship stats.
  - "vector_only" for "find jobs similar to X", "jobs that need Y skills",
                  "what roles are like Z".
  - "hybrid"      when the question needs both structured filtering AND semantic
                  similarity (e.g. "Python jobs at startups similar to Stripe").
  - "chitchat"    for greetings, meta-questions about the assistant, or anything
                  that has nothing to do with job data.

Return only valid JSON, no markdown fences.
"""


async def classify_and_plan(
    question: str,
    conversation_history: list[ConversationTurn],
) -> QueryPlan:
    """
    Use DeepSeek to classify the question and produce an execution plan.

    Returns a QueryPlan.  On any failure, falls back to CHITCHAT so the
    synthesiser can produce a graceful "I couldn't understand" message.
    """
    history_messages = [
        {"role": t.role, "content": t.content}
        for t in conversation_history[-6:]  # last 3 pairs to keep prompt short
    ]

    messages = [
        {"role": "system", "content": _CLASSIFICATION_PROMPT},
        *history_messages,
        {"role": "user", "content": question},
    ]

    client = _get_deepseek_client()
    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            max_tokens=512,
            temperature=0,      # deterministic planning
        )
        raw = (response.choices[0].message.content or "").strip()

        # Strip potential markdown fences (same pattern as job_analyzer.py)
        if raw.startswith("```"):
            raw = raw[raw.index("\n") + 1:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

        plan_dict = json.loads(raw)
        strategy = QueryStrategy(plan_dict.get("strategy", "chitchat"))
        return QueryPlan(
            strategy=strategy,
            sql=plan_dict.get("sql"),
            vector_query=plan_dict.get("vector_query"),
            rationale=plan_dict.get("rationale"),
        )

    except json.JSONDecodeError as exc:
        logger.warning(f"[Orchestrator] classify_and_plan JSON parse error: {exc}. Raw: {raw[:200]}")
        return QueryPlan(strategy=QueryStrategy.CHITCHAT)
    except Exception as exc:
        logger.error(f"[Orchestrator] classify_and_plan failed: {exc}")
        return QueryPlan(strategy=QueryStrategy.CHITCHAT)


# ---------------------------------------------------------------------------
# Step 2 — execute_plan
# ---------------------------------------------------------------------------

async def _self_correct_sql(
    broken_sql: str,
    error_message: str,
    question: str,
) -> Optional[str]:
    """
    Ask DeepSeek to fix a SQL error.  Called once (single retry loop).
    Returns corrected SQL string, or None if correction also fails.
    """
    prompt = (
        f"{_SCHEMA_CONTEXT}\n\n"
        f"The following SQL produced a Postgres error.\n\n"
        f"SQL:\n{broken_sql}\n\n"
        f"Error:\n{error_message}\n\n"
        f"Original question: {question}\n\n"
        "Please return a corrected SQL SELECT statement only, no explanation, no markdown."
    )
    client = _get_deepseek_client()
    try:
        resp = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=512,
            temperature=0,
        )
        corrected = (resp.choices[0].message.content or "").strip()
        if corrected.startswith("```"):
            corrected = corrected[corrected.index("\n") + 1:]
        if corrected.endswith("```"):
            corrected = corrected[:-3]
        return corrected.strip()
    except Exception as exc:
        logger.error(f"[Orchestrator] self-correct SQL failed: {exc}")
        return None


async def execute_plan(plan: QueryPlan, question: str) -> dict[str, Any]:
    """
    Execute the plan returned by classify_and_plan().

    Returns a dict:
      {
        "sql_rows":      list[dict] | None,
        "vector_rows":   list[dict] | None,
        "rows_returned": int,
        "error":         str | None,   # human-readable, passed to synthesiser
      }
    """
    result: dict[str, Any] = {
        "sql_rows": None,
        "vector_rows": None,
        "rows_returned": 0,
        "error": None,
    }

    # ---- SQL execution with one self-correction retry ----
    if plan.strategy in (QueryStrategy.SQL_ONLY, QueryStrategy.HYBRID) and plan.sql:
        try:
            rows = await execute_ai_query(plan.sql)
            result["sql_rows"] = rows
            result["rows_returned"] += len(rows)
        except asyncpg.PostgresError as exc:
            error_msg = str(exc)
            logger.warning(f"[Orchestrator] SQL error, attempting self-correction: {error_msg}")
            corrected_sql = await _self_correct_sql(plan.sql, error_msg, question)
            if corrected_sql:
                try:
                    rows = await execute_ai_query(corrected_sql)
                    result["sql_rows"] = rows
                    result["rows_returned"] += len(rows)
                    plan.sql = corrected_sql  # update plan so DONE metadata reflects corrected SQL
                except Exception as exc2:
                    logger.error(f"[Orchestrator] Self-corrected SQL also failed: {exc2}")
                    result["error"] = f"Database query failed after correction attempt: {exc2}"
            else:
                result["error"] = f"Database query failed: {error_msg}"
        except Exception as exc:
            logger.error(f"[Orchestrator] execute_plan SQL unexpected error: {exc}")
            result["error"] = f"Unexpected error during database query: {exc}"

    # ---- Vector search ----
    if plan.strategy in (QueryStrategy.VECTOR_ONLY, QueryStrategy.HYBRID):
        query_text = plan.vector_query or question
        try:
            vrows = await vector_search(query_text, limit=15)
            result["vector_rows"] = vrows
            result["rows_returned"] += len(vrows)
        except Exception as exc:
            logger.error(f"[Orchestrator] vector_search error: {exc}")
            # Non-fatal for hybrid — SQL results can still be synthesised
            if plan.strategy == QueryStrategy.VECTOR_ONLY:
                result["error"] = f"Semantic search failed: {exc}"

    return result


# ---------------------------------------------------------------------------
# Step 3 — synthesize_answer (streaming)
# ---------------------------------------------------------------------------

_SYNTHESIS_SYSTEM_PROMPT = """You are a helpful data analyst assistant for a job-tracking platform
called GoOneIn.  Your job is to answer the user's question using ONLY the data provided.

Rules:
- Be concise and direct.  Lead with the answer.
- Use bullet points or short tables when listing multiple items.
- If the data is empty, say clearly that no matching jobs were found.
- Never hallucinate data that is not in the context.
- If there is a database error, apologise briefly and suggest rephrasing.
- Do not mention "SQL", "query", "vector", or internal system details.
"""


def _format_data_for_synthesis(data: dict[str, Any]) -> str:
    """
    Serialise the raw execution result into a context block for DeepSeek.
    We truncate aggressively to stay well under the 32k context window.
    """
    parts: list[str] = []

    if data.get("error"):
        parts.append(f"[System note: {data['error']}]")

    sql_rows = data.get("sql_rows") or []
    if sql_rows:
        # Truncate to 200 rows for synthesis (remaining rows rarely add value)
        display_rows = sql_rows[:200]
        parts.append(f"DATABASE QUERY RESULTS ({len(sql_rows)} rows, showing up to 200):")
        parts.append(json.dumps(display_rows, default=str, indent=0))

    vector_rows = data.get("vector_rows") or []
    if vector_rows:
        # For vector results include top 10 with score
        display_vrows = vector_rows[:10]
        parts.append(f"\nSEMANTIC SEARCH RESULTS (top {len(display_vrows)} matches):")
        parts.append(json.dumps(display_vrows, default=str, indent=0))

    if not parts:
        parts.append("No data was returned from the database for this query.")

    # Hard cap: ~24 000 chars for the data block (leaves room for system + history + question)
    combined = "\n".join(parts)
    if len(combined) > 24_000:
        combined = combined[:24_000] + "\n...[truncated]"

    return combined


async def synthesize_answer(
    question: str,
    data: dict[str, Any],
    history: list[ConversationTurn],
) -> AsyncIterator[str]:
    """
    Async generator that yields streamed answer tokens from DeepSeek.

    Usage:
        async for token in synthesize_answer(q, data, history):
            yield token

    Handles rate-limit backoff (429) with exponential backoff, same pattern
    as the rest of the codebase (manual retry rather than SDK-level retry to
    stay consistent with existing patterns).
    """
    data_context = _format_data_for_synthesis(data)

    history_messages = [
        {"role": t.role, "content": t.content}
        for t in history[-6:]
    ]

    messages = [
        {"role": "system", "content": _SYNTHESIS_SYSTEM_PROMPT},
        *history_messages,
        {
            "role": "user",
            "content": (
                f"Data from the database:\n{data_context}\n\n"
                f"User question: {question}"
            ),
        },
    ]

    client = _get_deepseek_client()
    max_attempts = 3
    base_delay = 2.0

    for attempt in range(max_attempts):
        try:
            stream = await client.chat.completions.create(
                model="deepseek-chat",
                messages=messages,
                max_tokens=2048,
                temperature=0.3,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content
            return  # success — exit retry loop

        except Exception as exc:
            error_str = str(exc)
            is_rate_limit = "429" in error_str or "rate_limit" in error_str.lower()

            if is_rate_limit and attempt < max_attempts - 1:
                delay = base_delay * (2 ** attempt)
                logger.warning(
                    f"[Orchestrator] DeepSeek rate limit hit, retrying in {delay}s "
                    f"(attempt {attempt + 1}/{max_attempts})"
                )
                await asyncio.sleep(delay)
                continue

            # Non-retriable or final attempt
            logger.error(f"[Orchestrator] synthesize_answer failed: {exc}")
            yield "I encountered an error generating the answer. Please try rephrasing your question."
            return
