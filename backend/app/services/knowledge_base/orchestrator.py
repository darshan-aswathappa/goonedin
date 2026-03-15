"""
Main orchestration engine for the GoOneIn AI knowledge base.

Full flow (happy path):
  User question
    → classify(question)                        [LLM call #1]
    → if sql:   execute_sql(sql)                [DB call]
              → if error: correct_sql(sql, err) [LLM call #2, optional]
              →           execute_sql(fixed_sql) [DB call, retry]
    → if vector: search_similar_jobs(query)      [Embedding + DB]
    → if hybrid: both paths above in parallel
    → synthesize(question, results)             [LLM call #2 or #3]
    → store turn in session memory
    → maybe_compress_session (background)

Failure modes and mitigations:
  1. Classifier returns unsafe          → return canned refusal, no DB call
  2. Classifier returns chitchat        → answer directly, no DB call
  3. SQL fails on first try             → run corrector, retry once
  4. SQL fails after correction         → synthesize with "SQL failed" context
  5. SQL times out                      → graceful degradation message
  6. Vector search returns 0 results   → honest empty response
  7. Empty SQL result set               → synthesizer handles gracefully
  8. Synthesizer LLM call fails         → return formatted raw results
  9. Classifier returns invalid JSON    → retry once with stricter prompt

Streaming strategy:
  - Classify and DB execute run synchronously (must have results before synthesizing)
  - Synthesis step uses streaming so the user sees words appear immediately
  - Phase status messages are sent via async generator before the stream starts:
      {"phase": "classifying"}
      {"phase": "querying", "query_type": "sql"}
      {"phase": "synthesizing"}
      {"phase": "done", "usage": {...}}

This module exposes two entry points:
  - ask(...)           → AsyncGenerator yielding phase events + streamed text chunks
  - ask_sync(...)      → Awaitable returning the full answer string (for simple callers)
"""

import asyncio
import json
import logging
import time
from typing import Any, AsyncGenerator, Optional

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.knowledge_base.prompts import (
    build_classifier_system_prompt,
    build_sql_corrector_system_prompt,
    build_synthesizer_system_prompt,
)
from app.services.knowledge_base.sql_executor import (
    SQLExecutionError,
    SQLSecurityError,
    execute_query,
    format_results_for_llm,
)
from app.services.knowledge_base.embeddings import (
    search_similar_jobs,
    format_vector_results_for_llm,
)
from app.services.knowledge_base.conversation_memory import (
    get_or_create_session,
    add_turn,
    build_messages_for_llm,
    maybe_compress_session,
)

logger = logging.getLogger("KnowledgeBase.Orchestrator")
settings = get_settings()

# Max retries for SQL correction
MAX_SQL_RETRIES = 1

# Canned responses for non-data queries
CHITCHAT_SYSTEM_PROMPT = """You are the GoOneIn data assistant. Answer this conversational message briefly.
You are embedded in a job tracking platform. You can answer questions about job market data,
skills, companies, salaries, visa sponsorship, and work models using the platform's database.
Keep your response to 2-3 sentences maximum."""

UNSAFE_RESPONSE = (
    "This request accesses restricted data or attempts a disallowed operation. "
    "Only read queries against non-PII tables are permitted."
)


def _make_deepseek_client() -> AsyncOpenAI:
    """Create the DeepSeek async client matching the existing codebase pattern."""
    return AsyncOpenAI(
        api_key=settings.DEEPSEEK_API_KEY,
        base_url="https://api.deepseek.com",
    )


# ---------------------------------------------------------------------------
# Step 1: Classify
# ---------------------------------------------------------------------------

async def _classify(
    question: str,
    session_id: str,
    retry: bool = False,
) -> dict[str, Any]:
    """
    Classify the user question and draft SQL/vector_query if applicable.

    Returns dict with keys: query_type, sql, vector_query, explanation, needs_user_id
    On failure returns {"query_type": "error", "explanation": str}
    """
    client = _make_deepseek_client()

    system_prompt = build_classifier_system_prompt()
    if retry:
        # On retry, add explicit JSON enforcement instruction
        system_prompt += "\n\nCRITICAL: Return ONLY the JSON object. No markdown, no explanation outside the JSON."

    messages = build_messages_for_llm(session_id, system_prompt, question)

    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            max_tokens=800,
            temperature=0.0,  # Deterministic classification
        )
        raw = response.choices[0].message.content or ""
        raw = raw.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw[raw.index("\n") + 1:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

        result = json.loads(raw)

        # Validate required fields
        required = {"query_type", "sql", "vector_query", "explanation", "needs_user_id"}
        if not required.issubset(result.keys()):
            raise ValueError(f"Missing keys in classifier response: {result.keys()}")

        return result

    except json.JSONDecodeError as e:
        if not retry:
            logger.warning(f"[Orchestrator] Classifier returned invalid JSON, retrying: {e}")
            return await _classify(question, session_id, retry=True)
        logger.error(f"[Orchestrator] Classifier JSON parse failed twice: {e}")
        return {"query_type": "error", "explanation": "Classifier returned invalid JSON"}

    except Exception as e:
        logger.error(f"[Orchestrator] Classifier failed: {e}")
        return {"query_type": "error", "explanation": str(e)}


# ---------------------------------------------------------------------------
# Step 2: SQL correction
# ---------------------------------------------------------------------------

async def _correct_sql(
    original_sql: str,
    pg_error: str,
    user_question: str,
) -> Optional[str]:
    """
    Ask the corrector LLM to fix a broken SQL query.

    Returns the corrected SQL string, or None if correction failed/impossible.
    """
    client = _make_deepseek_client()

    user_message = (
        f"Original user question: {user_question}\n\n"
        f"Broken SQL:\n{original_sql}\n\n"
        f"PostgreSQL error:\n{pg_error}"
    )

    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": build_sql_corrector_system_prompt()},
                {"role": "user", "content": user_message},
            ],
            max_tokens=600,
            temperature=0.0,
        )
        raw = response.choices[0].message.content or ""
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw[raw.index("\n") + 1:]
        if raw.endswith("```"):
            raw = raw[:-3]

        result = json.loads(raw.strip())
        corrected_sql = result.get("corrected_sql")
        fix_desc = result.get("fix_description", "")

        if corrected_sql:
            logger.info(f"[Orchestrator] SQL corrected. Fix: {fix_desc}")
            return corrected_sql
        else:
            logger.warning(f"[Orchestrator] Corrector could not fix SQL: {fix_desc}")
            return None

    except Exception as e:
        logger.error(f"[Orchestrator] SQL corrector failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Step 3: Execute SQL with retry
# ---------------------------------------------------------------------------

async def _execute_with_retry(
    sql: str,
    params: dict[str, Any],
    user_question: str,
) -> tuple[list[dict], str, Optional[str]]:
    """
    Execute SQL. If it fails, attempt correction once and retry.

    Returns (rows, final_sql_used, error_message_or_none).
    - rows: list of result dicts (may be empty)
    - final_sql_used: the SQL that was actually executed
    - error_message: None on success, error string on failure
    """
    try:
        rows = await execute_query(sql, params)
        return rows, sql, None

    except SQLSecurityError as e:
        logger.warning(f"[Orchestrator] SQL security violation: {e}")
        return [], sql, f"Security violation: {e}"

    except SQLExecutionError as e:
        logger.warning(
            f"[Orchestrator] SQL failed on first attempt: {e.pg_error}. "
            "Attempting correction..."
        )
        corrected_sql = await _correct_sql(sql, e.pg_error, user_question)

        if corrected_sql:
            try:
                rows = await execute_query(corrected_sql, params)
                return rows, corrected_sql, None
            except (SQLExecutionError, SQLSecurityError) as e2:
                logger.error(
                    f"[Orchestrator] SQL failed after correction: {e2}. Giving up."
                )
                return [], corrected_sql, f"Query failed after correction attempt: {e2}"
            except Exception as e2:
                logger.error(f"[Orchestrator] Unexpected error on corrected SQL: {e2}")
                return [], corrected_sql, f"Unexpected error: {e2}"
        else:
            return [], sql, f"SQL error (correction not possible): {e.pg_error}"

    except Exception as e:
        logger.error(f"[Orchestrator] Unexpected SQL execution error: {e}")
        return [], sql, f"Database error: {e}"


# ---------------------------------------------------------------------------
# Step 4: Synthesize
# ---------------------------------------------------------------------------

async def _synthesize_stream(
    question: str,
    data_context: str,
    session_id: str,
) -> AsyncGenerator[str, None]:
    """
    Stream the synthesized answer from the LLM.

    Yields string chunks as they arrive from the API.
    The caller is responsible for concatenating and storing the full response.
    """
    client = _make_deepseek_client()

    system_prompt = build_synthesizer_system_prompt()
    user_message = (
        f"User question: {question}\n\n"
        f"Data:\n{data_context}"
    )
    messages = build_messages_for_llm(session_id, system_prompt, user_message)

    try:
        stream = await client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            max_tokens=1200,
            temperature=0.2,  # Slight creativity for natural phrasing, but mostly factual
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    except Exception as e:
        logger.error(f"[Orchestrator] Synthesizer stream failed: {e}")
        yield f"\n[Error generating response: {e}]"


async def _synthesize_chitchat(question: str) -> str:
    """Handle chitchat/off-topic questions with a brief non-data response."""
    client = _make_deepseek_client()
    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": CHITCHAT_SYSTEM_PROMPT},
                {"role": "user", "content": question},
            ],
            max_tokens=200,
            temperature=0.3,
        )
        return response.choices[0].message.content or "Ask me about job market data."
    except Exception:
        return "Ask me about job market data — skills, salaries, visa sponsorship, company trends."


# ---------------------------------------------------------------------------
# Main entry point: ask() — streaming
# ---------------------------------------------------------------------------

async def ask(
    question: str,
    session_id: str,
    user_id: str,
    supabase: Any,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Main entry point. Yields server-sent event dicts:

      {"type": "phase", "phase": "classifying"}
      {"type": "phase", "phase": "querying", "query_type": "sql"}
      {"type": "phase", "phase": "synthesizing"}
      {"type": "chunk", "content": "**847** jobs..."}   ← streamed text
      {"type": "done", "elapsed_ms": 1234, "query_type": "sql"}
      {"type": "error", "message": "..."}               ← on fatal failure

    Usage in FastAPI with StreamingResponse or WebSocket:
        async for event in ask(question, session_id, user_id, supabase):
            await websocket.send_json(event)
    """
    start_time = time.monotonic()

    # Ensure session exists
    get_or_create_session(session_id, user_id)

    # --- Phase 1: Classify ---
    yield {"type": "phase", "phase": "classifying"}

    classification = await _classify(question, session_id)
    query_type = classification.get("query_type", "error")
    logger.info(
        f"[Orchestrator] Session {session_id[:8]}... | "
        f"type={query_type} | Q: {question[:80]}"
    )

    # --- Handle special query types immediately ---

    if query_type == "unsafe":
        add_turn(session_id, "user", question)
        add_turn(session_id, "assistant", UNSAFE_RESPONSE)
        yield {"type": "chunk", "content": UNSAFE_RESPONSE}
        yield {"type": "done", "elapsed_ms": int((time.monotonic() - start_time) * 1000), "query_type": "unsafe"}
        return

    if query_type == "error":
        error_msg = classification.get("explanation", "Classification failed")
        yield {"type": "error", "message": error_msg}
        return

    if query_type == "chitchat":
        yield {"type": "phase", "phase": "responding"}
        answer = await _synthesize_chitchat(question)
        add_turn(session_id, "user", question)
        add_turn(session_id, "assistant", answer)
        yield {"type": "chunk", "content": answer}
        yield {"type": "done", "elapsed_ms": int((time.monotonic() - start_time) * 1000), "query_type": "chitchat"}
        asyncio.create_task(maybe_compress_session(session_id))
        return

    # --- Phase 2: Query (SQL, vector, or hybrid) ---

    yield {"type": "phase", "phase": "querying", "query_type": query_type}

    data_context_parts: list[str] = []

    # Build params dict
    params: dict[str, Any] = {}
    if classification.get("needs_user_id"):
        params["user_id"] = user_id

    # --- SQL path ---
    if query_type in ("sql", "hybrid"):
        sql = classification.get("sql")
        if sql:
            rows, final_sql, error_msg = await _execute_with_retry(sql, params, question)

            if error_msg:
                data_context_parts.append(f"SQL EXECUTION FAILED: {error_msg}")
                logger.warning(f"[Orchestrator] SQL path failed: {error_msg}")
            elif not rows:
                data_context_parts.append(
                    f"SQL executed successfully but returned 0 rows.\n"
                    f"Query: {final_sql}"
                )
            else:
                data_context_parts.append(format_results_for_llm(rows, final_sql))
        else:
            data_context_parts.append("No SQL was generated for this query.")

    # --- Vector path ---
    if query_type in ("vector", "hybrid"):
        vector_query = classification.get("vector_query")
        if vector_query:
            vector_results = await search_similar_jobs(vector_query, supabase)
            data_context_parts.append(format_vector_results_for_llm(vector_results))
        else:
            data_context_parts.append("No vector query was generated.")

    data_context = "\n\n---\n\n".join(data_context_parts)

    # --- Phase 3: Synthesize ---

    yield {"type": "phase", "phase": "synthesizing"}

    full_answer_parts: list[str] = []
    async for chunk in _synthesize_stream(question, data_context, session_id):
        full_answer_parts.append(chunk)
        yield {"type": "chunk", "content": chunk}

    full_answer = "".join(full_answer_parts)

    # Store turn in memory
    add_turn(session_id, "user", question)
    add_turn(session_id, "assistant", full_answer)

    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    yield {
        "type": "done",
        "elapsed_ms": elapsed_ms,
        "query_type": query_type,
    }

    logger.info(
        f"[Orchestrator] Session {session_id[:8]}... completed in {elapsed_ms}ms"
    )

    # Background: compress session if needed
    asyncio.create_task(maybe_compress_session(session_id))


# ---------------------------------------------------------------------------
# Convenience entry point: ask_sync() — non-streaming, awaitable
# ---------------------------------------------------------------------------

async def ask_sync(
    question: str,
    session_id: str,
    user_id: str,
    supabase: Any,
) -> dict[str, Any]:
    """
    Non-streaming version of ask(). Buffers all chunks and returns a single dict:
    {
      "answer": str,
      "query_type": str,
      "elapsed_ms": int,
      "error": str | None
    }

    Useful for REST endpoints that don't support streaming.
    """
    answer_chunks: list[str] = []
    query_type = "unknown"
    elapsed_ms = 0
    error: Optional[str] = None

    async for event in ask(question, session_id, user_id, supabase):
        if event["type"] == "chunk":
            answer_chunks.append(event["content"])
        elif event["type"] == "done":
            query_type = event.get("query_type", "unknown")
            elapsed_ms = event.get("elapsed_ms", 0)
        elif event["type"] == "error":
            error = event.get("message", "Unknown error")

    return {
        "answer": "".join(answer_chunks),
        "query_type": query_type,
        "elapsed_ms": elapsed_ms,
        "error": error,
    }
