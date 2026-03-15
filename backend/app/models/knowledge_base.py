"""
Pydantic models for the Knowledge Base AI query feature.

Keeps request/response shapes in one place so both the router and the
orchestrator import from here rather than defining inline TypedDicts.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Streaming event envelope — every SSE line is one of these
# ---------------------------------------------------------------------------

class SSEEventType(str, Enum):
    STATUS = "status"    # "Classifying question...", "Querying database..."
    CHUNK  = "chunk"     # streaming answer token
    DONE   = "done"      # terminal event with metadata
    ERROR  = "error"     # something went wrong; stream ends after this


class SSEEvent(BaseModel):
    type: SSEEventType
    # STATUS / ERROR carry message; CHUNK carries text; DONE carries metadata
    message: Optional[str] = None
    text: Optional[str] = None
    # Only present on type=DONE
    session_id: Optional[str] = None
    rows_returned: Optional[int] = None
    query_plan: Optional[dict] = None


# ---------------------------------------------------------------------------
# Query classification / planning
# ---------------------------------------------------------------------------

class QueryStrategy(str, Enum):
    SQL_ONLY     = "sql_only"     # structured aggregation (counts, averages, filters)
    VECTOR_ONLY  = "vector_only"  # "find jobs similar to X"
    HYBRID       = "hybrid"       # SQL for metadata + vector for semantic re-ranking
    CHITCHAT     = "chitchat"     # greetings, meta-questions — no DB needed


class QueryPlan(BaseModel):
    """
    The orchestrator's execution plan for one user question.

    Produced by classify_and_plan(), consumed by execute_plan().
    """
    strategy: QueryStrategy
    # Generated SQL (None when strategy == VECTOR_ONLY or CHITCHAT)
    sql: Optional[str] = None
    # Natural-language query for vector search (None when strategy == SQL_ONLY)
    vector_query: Optional[str] = None
    # Human-readable rationale for the chosen strategy (logged, not streamed)
    rationale: Optional[str] = None


# ---------------------------------------------------------------------------
# HTTP request / response shapes
# ---------------------------------------------------------------------------

class KBQueryRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2_000)
    session_id: Optional[str] = Field(
        default=None,
        description="Omit on first message; pass back the returned session_id for continuity",
    )


class ConversationTurn(BaseModel):
    role: str              # "user" | "assistant"
    content: str
    timestamp: Optional[str] = None  # ISO-8601 string


class SessionResponse(BaseModel):
    session_id: str
    turns: list[ConversationTurn]
