"""
Knowledge Base API Router.

Endpoints:
  POST   /knowledge-base/query                 — main SSE streaming query endpoint
  GET    /knowledge-base/sessions/{session_id} — fetch conversation history
  DELETE /knowledge-base/sessions/{session_id} — clear session

Streaming design:
  The POST endpoint uses FastAPI StreamingResponse with media_type="text/event-stream".
  Each event is a JSON object on a "data: <json>\\n\\n" line per the SSE spec.

  Event sequence for a successful query:
    data: {"type":"status","message":"Classifying your question..."}
    data: {"type":"status","message":"Querying the database..."}
    data: {"type":"chunk","text":"Python leads..."}
    data: {"type":"chunk","text":" with 42 postings..."}
    data: {"type":"done","session_id":"...","rows_returned":42,"query_plan":{...}}

  The frontend MUST use fetch() + ReadableStream, NOT EventSource (which is
  GET-only and cannot carry a JSON request body).

Auth:
  All endpoints use Depends(get_current_user) — the same Supabase JWT pattern
  as every other protected endpoint in main.py.
"""

from __future__ import annotations

import logging
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.core.auth import get_current_user
from app.models.knowledge_base import (
    ConversationTurn,
    KBQueryRequest,
    QueryPlan,
    QueryStrategy,
    SSEEvent,
    SSEEventType,
    SessionResponse,
)
from app.services.ai_orchestrator import (
    append_turn,
    classify_and_plan,
    create_session,
    delete_session,
    execute_plan,
    get_session_turns,
    synthesize_answer,
    _sessions,
)

logger = logging.getLogger("KnowledgeBaseAPI")

router = APIRouter(prefix="/knowledge-base", tags=["Knowledge Base"])


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _sse_line(event: SSEEvent) -> str:
    """
    Encode one SSEEvent as a Server-Sent Events data line.
    Format: "data: <json>\\n\\n"  (double newline delimits events per SSE spec).
    """
    return f"data: {event.model_dump_json(exclude_none=True)}\n\n"


# ---------------------------------------------------------------------------
# Core streaming generator
# ---------------------------------------------------------------------------

async def _query_stream(
    request: KBQueryRequest,
    user: dict,
) -> AsyncIterator[str]:
    """
    Async generator that drives the full query pipeline and yields SSE lines.

    Steps:
      1. Resolve or create session
      2. classify_and_plan() → QueryPlan
      3. execute_plan()       → raw data dict   (SQL + vector results)
      4. synthesize_answer()  → streamed tokens
      5. Persist turns to session history
    """
    # ---- Session management ----
    session_id = request.session_id or create_session()
    history = get_session_turns(session_id)

    # ---- Step 1: classify ----
    yield _sse_line(SSEEvent(type=SSEEventType.STATUS, message="Classifying your question..."))

    plan: QueryPlan = await classify_and_plan(request.message, history)
    logger.info(
        f"[KB] user={user['user_id'][:8]} strategy={plan.strategy} "
        f"rationale={plan.rationale!r}"
    )

    # ---- Chitchat fast path — skip DB entirely ----
    if plan.strategy == QueryStrategy.CHITCHAT:
        yield _sse_line(SSEEvent(type=SSEEventType.STATUS, message="Generating answer..."))

        full_answer: list[str] = []
        async for token in synthesize_answer(request.message, {}, history):
            full_answer.append(token)
            yield _sse_line(SSEEvent(type=SSEEventType.CHUNK, text=token))

        answer_text = "".join(full_answer)
        append_turn(session_id, "user", request.message)
        append_turn(session_id, "assistant", answer_text)

        yield _sse_line(SSEEvent(
            type=SSEEventType.DONE,
            session_id=session_id,
            rows_returned=0,
            query_plan=plan.model_dump(exclude_none=True),
        ))
        return

    # ---- Step 2: status events before DB call ----
    if plan.strategy in (QueryStrategy.SQL_ONLY, QueryStrategy.HYBRID):
        yield _sse_line(SSEEvent(type=SSEEventType.STATUS, message="Querying the database..."))
    if plan.strategy in (QueryStrategy.VECTOR_ONLY, QueryStrategy.HYBRID):
        yield _sse_line(SSEEvent(type=SSEEventType.STATUS, message="Running semantic search..."))

    # ---- Step 3: execute plan ----
    data = await execute_plan(plan, request.message)

    rows = data.get("rows_returned", 0)
    if rows:
        yield _sse_line(SSEEvent(
            type=SSEEventType.STATUS,
            message=f"Found {rows} result{'s' if rows != 1 else ''}. Synthesising answer...",
        ))
    else:
        yield _sse_line(SSEEvent(type=SSEEventType.STATUS, message="Synthesising answer..."))

    # ---- Step 4: streaming synthesis ----
    full_answer = []
    async for token in synthesize_answer(request.message, data, history):
        full_answer.append(token)
        yield _sse_line(SSEEvent(type=SSEEventType.CHUNK, text=token))

    answer_text = "".join(full_answer)

    # ---- Step 5: persist conversation turns ----
    append_turn(session_id, "user", request.message)
    append_turn(session_id, "assistant", answer_text)

    yield _sse_line(SSEEvent(
        type=SSEEventType.DONE,
        session_id=session_id,
        rows_returned=rows,
        query_plan=plan.model_dump(exclude_none=True),
    ))


# ---------------------------------------------------------------------------
# POST /knowledge-base/query
# ---------------------------------------------------------------------------

@router.post("/query")
async def query_knowledge_base(
    request: KBQueryRequest,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """
    Main knowledge base query endpoint.  Returns a text/event-stream SSE response.

    Request body:
        { "message": "Which companies sponsor H1B?", "session_id": "optional-uuid" }

    The response body is a stream of SSE events.  Parse them client-side with:

        const resp = await fetch('/knowledge-base/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ message, session_id }),
        });
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const lines = decoder.decode(value).split('\\n\\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const event = JSON.parse(line.slice(6));
                    // handle event.type: 'status' | 'chunk' | 'done' | 'error'
                }
            }
        }
    """
    async def _safe_stream() -> AsyncIterator[str]:
        """
        Wraps _query_stream so any unhandled exception becomes an ERROR event
        rather than a raw TCP disconnect (which is invisible to the frontend).
        """
        try:
            async for chunk in _query_stream(request, user):
                yield chunk
        except Exception as exc:
            logger.error(f"[KB] Unhandled stream error: {exc}", exc_info=True)
            yield _sse_line(SSEEvent(
                type=SSEEventType.ERROR,
                message="An unexpected error occurred. Please try again.",
            ))

    return StreamingResponse(
        _safe_stream(),
        media_type="text/event-stream",
        headers={
            # Prevent nginx/proxies from buffering the SSE stream
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# GET /knowledge-base/sessions/{session_id}
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    user: dict = Depends(get_current_user),
) -> SessionResponse:
    """
    Fetch the conversation history for a session.

    Sessions live in-process (no DB persistence in this version).
    Returns 404 if the session does not exist or has been evicted.
    """
    turns = get_session_turns(session_id)
    # get_session_turns returns [] for both "empty but live" and "non-existent"
    # so we check the raw dict to distinguish the two cases.
    if not turns and session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return SessionResponse(session_id=session_id, turns=turns)


# ---------------------------------------------------------------------------
# DELETE /knowledge-base/sessions/{session_id}
# ---------------------------------------------------------------------------

@router.delete("/sessions/{session_id}", status_code=204)
async def clear_session(
    session_id: str,
    user: dict = Depends(get_current_user),
) -> None:
    """
    Delete a session and its conversation history.

    Idempotent — returns 204 even if the session did not exist or had already
    been auto-evicted by the TTL.
    """
    delete_session(session_id)
