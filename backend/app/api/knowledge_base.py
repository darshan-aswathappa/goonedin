"""
Knowledge Base API Router.

Endpoints:
  POST   /knowledge-base/query                 - main SSE streaming query endpoint
  GET    /knowledge-base/sessions/{session_id} - fetch conversation history
  DELETE /knowledge-base/sessions/{session_id} - clear session

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
  All endpoints use Depends(get_current_user) - the same Supabase JWT pattern
  as every other protected endpoint in main.py.
"""

from __future__ import annotations

import logging
import uuid
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.core.auth import get_current_user
from app.core.user_manager import get_supabase_client
from app.models.knowledge_base import (
    ConversationTurn,
    KBQueryRequest,
    SSEEvent,
    SSEEventType,
    SessionResponse,
)
from app.services.knowledge_base.orchestrator import ask
from app.services.knowledge_base.conversation_memory import (
    get_session,
    get_or_create_session,
    delete_session,
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
# Phase-to-status message mapping
# ---------------------------------------------------------------------------

_PHASE_MESSAGES: dict[str, str] = {
    "classifying": "Classifying your question...",
    "querying": "Querying the database...",
    "responding": "Generating answer...",
    "synthesizing": "Synthesising answer...",
}


# ---------------------------------------------------------------------------
# Core streaming generator
# ---------------------------------------------------------------------------

async def _query_stream(
    request: KBQueryRequest,
    user: dict,
) -> AsyncIterator[str]:
    """
    Async generator that calls the orchestrator's ask() and translates
    its events into SSE lines the frontend expects.

    Orchestrator events -> Frontend SSE events:
      phase   -> SSEEvent(type=STATUS, message=...)
      chunk   -> SSEEvent(type=CHUNK, text=...)
      done    -> SSEEvent(type=DONE, session_id=..., rows_returned=..., query_plan=...)
      error   -> SSEEvent(type=ERROR, message=...)
    """
    # Session management
    session_id = request.session_id or str(uuid.uuid4())
    user_id = user["user_id"]
    supabase = get_supabase_client()

    # Ensure session exists in conversation memory
    get_or_create_session(session_id, user_id)

    # Stream events from orchestrator and translate
    async for event in ask(session_id=session_id, question=request.message, user_id=user_id, supabase=supabase):
        event_type = event.get("type")

        if event_type == "phase":
            phase = event.get("phase", "")
            # Build a human-readable status message
            message = _PHASE_MESSAGES.get(phase, f"{phase.capitalize()}...")

            # Enrich querying message with query type
            if phase == "querying":
                query_type = event.get("query_type", "")
                if query_type == "vector":
                    message = "Running semantic search..."
                elif query_type == "hybrid":
                    message = "Querying the database and running semantic search..."

            yield _sse_line(SSEEvent(type=SSEEventType.STATUS, message=message))

        elif event_type == "chunk":
            yield _sse_line(SSEEvent(type=SSEEventType.CHUNK, text=event.get("content", "")))

        elif event_type == "done":
            yield _sse_line(SSEEvent(
                type=SSEEventType.DONE,
                session_id=session_id,
                rows_returned=event.get("rows_returned"),
                query_plan={
                    "query_type": event.get("query_type", "unknown"),
                    "elapsed_ms": event.get("elapsed_ms"),
                    "sql_query": event.get("sql_query"),
                    "sql_time_ms": event.get("sql_time_ms"),
                },
            ))

        elif event_type == "error":
            yield _sse_line(SSEEvent(
                type=SSEEventType.ERROR,
                message=event.get("message", "An unexpected error occurred."),
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
async def get_session_endpoint(
    session_id: str,
    user: dict = Depends(get_current_user),
) -> SessionResponse:
    """
    Fetch the conversation history for a session.

    Sessions live in-process (no DB persistence in this version).
    Returns 404 if the session does not exist or has been evicted.
    """
    session = get_session(session_id)
    if session is None or session.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    turns = [
        ConversationTurn(role=t["role"], content=t["content"])
        for t in session.get("turns", [])
    ]
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

    Idempotent - returns 204 even if the session did not exist or had already
    been auto-evicted by the TTL.
    """
    session = get_session(session_id)
    if session is not None and session.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    delete_session(session_id)
