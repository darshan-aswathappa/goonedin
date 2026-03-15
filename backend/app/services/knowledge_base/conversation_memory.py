"""
Conversation memory management for the GoOneIn knowledge base.

Design decisions:
  - Keep last 8 full turns (4 user + 4 assistant) verbatim in context.
    Beyond that, compress old turns into a dense summary to reclaim tokens.
  - Sessions are stored in-memory (per-process, keyed by session_id).
    For production multi-instance deployments, swap the in-memory store for
    a Redis/Supabase backend using the same interface.
  - Session TTL: 2 hours of inactivity → session is evicted.
  - Session ID: caller-supplied UUID (usually matches the Supabase user_id
    for single-session users, or user_id + tab_id for multi-tab).
  - Max context tokens sent to LLM: ~6000 tokens of history
    (leaves room for schema context + SQL results + new query).

Memory structure per session:
  {
    "session_id": str,
    "user_id": str,
    "turns": [{"role": "user"|"assistant", "content": str}, ...],
    "summary": str | None,          # compressed summary of old turns
    "key_facts": [str, ...],         # extracted facts from old turns
    "last_active": float,            # monotonic timestamp
    "turn_count": int                # total turns ever (for session stats)
  }
"""

import asyncio
import json
import logging
import time
from typing import Any, Optional

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.knowledge_base.prompts import CONVERSATION_SUMMARIZER_SYSTEM_PROMPT

logger = logging.getLogger("KnowledgeBase.Memory")
settings = get_settings()

# Maximum number of full turns to keep verbatim before compression kicks in.
# A "turn" = one user message + one assistant response = 2 items in the list.
MAX_VERBATIM_TURNS = 8  # = 4 exchanges

# After this many turns, compress the oldest half.
COMPRESSION_TRIGGER = 12  # = 6 exchanges before compression

# Session TTL in seconds (evict sessions inactive longer than this).
SESSION_TTL_SECONDS = 7200  # 2 hours

# In-memory session store: session_id → session dict
_sessions: dict[str, dict[str, Any]] = {}

# Background cleanup runs every 5 minutes.
_cleanup_task: Optional[asyncio.Task] = None


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

def create_session(session_id: str, user_id: str) -> dict[str, Any]:
    """Create and register a new conversation session."""
    session = {
        "session_id": session_id,
        "user_id": user_id,
        "turns": [],
        "summary": None,
        "key_facts": [],
        "last_active": time.monotonic(),
        "turn_count": 0,
    }
    _sessions[session_id] = session
    logger.info(f"[Memory] Created session {session_id[:8]}... for user {user_id[:8]}...")
    return session


def get_session(session_id: str) -> Optional[dict[str, Any]]:
    """Retrieve a session by ID, updating last_active. Returns None if not found."""
    session = _sessions.get(session_id)
    if session:
        session["last_active"] = time.monotonic()
    return session


def get_or_create_session(session_id: str, user_id: str) -> dict[str, Any]:
    """Get existing session or create a new one."""
    session = get_session(session_id)
    if session is None:
        session = create_session(session_id, user_id)
    return session


def add_turn(session_id: str, role: str, content: str) -> None:
    """
    Append a turn to the session history.

    Args:
        session_id: Session identifier
        role:       "user" or "assistant"
        content:    The message content
    """
    session = _sessions.get(session_id)
    if not session:
        logger.warning(f"[Memory] add_turn called on unknown session {session_id}")
        return

    session["turns"].append({"role": role, "content": content})
    session["turn_count"] += 1
    session["last_active"] = time.monotonic()


def delete_session(session_id: str) -> None:
    """Explicitly delete a session (e.g., on user logout)."""
    _sessions.pop(session_id, None)


def get_session_stats() -> dict[str, Any]:
    """Return current memory stats for monitoring."""
    now = time.monotonic()
    return {
        "active_sessions": len(_sessions),
        "sessions": [
            {
                "session_id": sid[:8] + "...",
                "turn_count": s["turn_count"],
                "verbatim_turns": len(s["turns"]),
                "has_summary": s["summary"] is not None,
                "idle_minutes": round((now - s["last_active"]) / 60, 1),
            }
            for sid, s in _sessions.items()
        ],
    }


# ---------------------------------------------------------------------------
# Context building
# ---------------------------------------------------------------------------

def build_messages_for_llm(
    session_id: str,
    system_prompt: str,
    new_user_message: str,
) -> list[dict[str, str]]:
    """
    Build the full messages array to send to the LLM, combining:
      1. System prompt
      2. Compressed summary (if present, injected as system context)
      3. Verbatim recent turns
      4. The new user message

    Args:
        session_id:       The active session
        system_prompt:    The task-specific system prompt (classifier/synthesizer/etc)
        new_user_message: The current user query

    Returns:
        List of {"role": ..., "content": ...} dicts ready for the API call.
    """
    session = _sessions.get(session_id, {})
    turns = session.get("turns", [])
    summary = session.get("summary")
    key_facts = session.get("key_facts", [])

    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]

    # Inject compressed history as a system message (not user/assistant to avoid
    # confusing the LLM about who said what)
    if summary or key_facts:
        history_context_parts = []
        if summary:
            history_context_parts.append(f"CONVERSATION HISTORY SUMMARY:\n{summary}")
        if key_facts:
            facts_str = "\n".join(f"  - {f}" for f in key_facts)
            history_context_parts.append(f"KEY FACTS FROM PREVIOUS TURNS:\n{facts_str}")
        if history_context_parts:
            messages.append({
                "role": "system",
                "content": "\n\n".join(history_context_parts)
            })

    # Add verbatim recent turns (last MAX_VERBATIM_TURNS items)
    recent_turns = turns[-MAX_VERBATIM_TURNS:]
    messages.extend(recent_turns)

    # Add the new user message
    messages.append({"role": "user", "content": new_user_message})

    return messages


# ---------------------------------------------------------------------------
# Compression
# ---------------------------------------------------------------------------

async def maybe_compress_session(session_id: str) -> None:
    """
    Trigger compression if the session has grown beyond COMPRESSION_TRIGGER turns.
    Compresses the oldest half of the verbatim turns into a summary.
    This is fire-and-forget — called after a response is sent to the user.
    """
    session = _sessions.get(session_id)
    if not session:
        return

    turns = session["turns"]
    if len(turns) < COMPRESSION_TRIGGER:
        return

    # Split: compress the older half, keep the newer half verbatim
    split_point = len(turns) // 2
    turns_to_compress = turns[:split_point]
    turns_to_keep = turns[split_point:]

    logger.info(
        f"[Memory] Compressing {split_point} turns for session {session_id[:8]}..."
    )

    compressed = await _compress_turns(
        turns_to_compress,
        existing_summary=session.get("summary"),
        existing_facts=session.get("key_facts", []),
    )

    if compressed:
        session["summary"] = compressed.get("compressed_summary", session.get("summary"))
        session["key_facts"] = compressed.get("key_facts", session.get("key_facts", []))
        session["turns"] = turns_to_keep
        logger.info(
            f"[Memory] Session {session_id[:8]}... compressed to "
            f"{len(turns_to_keep)} verbatim turns + summary"
        )
    else:
        # Compression failed — fall back to trimming the oldest turns
        session["turns"] = turns[-MAX_VERBATIM_TURNS:]
        logger.warning(
            f"[Memory] Compression failed for session {session_id[:8]}..., "
            f"trimmed to {MAX_VERBATIM_TURNS} turns"
        )


async def _compress_turns(
    turns: list[dict[str, str]],
    existing_summary: Optional[str],
    existing_facts: list[str],
) -> Optional[dict[str, Any]]:
    """
    Call the LLM to compress a list of turns into a dense summary.
    Returns the parsed JSON response or None on failure.
    """
    if not turns:
        return None

    # Build the compression request
    turns_text = "\n".join(
        f"[{t['role'].upper()}]: {t['content'][:500]}" for t in turns
    )

    context_parts = []
    if existing_summary:
        context_parts.append(f"EXISTING SUMMARY:\n{existing_summary}")
    if existing_facts:
        context_parts.append(f"EXISTING FACTS:\n{chr(10).join(existing_facts)}")
    context_parts.append(f"NEW TURNS TO COMPRESS:\n{turns_text}")

    user_message = "\n\n".join(context_parts)

    client = AsyncOpenAI(
        api_key=settings.DEEPSEEK_API_KEY,
        base_url="https://api.deepseek.com",
    )

    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": CONVERSATION_SUMMARIZER_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            max_tokens=600,
            temperature=0.1,
        )
        raw = response.choices[0].message.content or ""
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw[raw.index("\n") + 1:]
        if raw.endswith("```"):
            raw = raw[:-3]
        return json.loads(raw.strip())
    except Exception as e:
        logger.error(f"[Memory] Compression LLM call failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Background session cleanup
# ---------------------------------------------------------------------------

async def _cleanup_expired_sessions() -> None:
    """Background task: evict sessions that have been idle beyond SESSION_TTL_SECONDS."""
    while True:
        await asyncio.sleep(300)  # Run every 5 minutes
        now = time.monotonic()
        expired = [
            sid for sid, s in _sessions.items()
            if (now - s["last_active"]) > SESSION_TTL_SECONDS
        ]
        for sid in expired:
            del _sessions[sid]
            logger.info(f"[Memory] Evicted expired session {sid[:8]}...")
        if expired:
            logger.info(f"[Memory] Evicted {len(expired)} expired sessions. Active: {len(_sessions)}")


def start_cleanup_task() -> None:
    """Start the background cleanup coroutine. Call once at application startup."""
    global _cleanup_task
    if _cleanup_task is None or _cleanup_task.done():
        _cleanup_task = asyncio.create_task(_cleanup_expired_sessions())
        logger.info("[Memory] Started session cleanup background task")
