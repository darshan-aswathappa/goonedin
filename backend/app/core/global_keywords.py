"""
Admin-controlled global keywords data-access helpers.

All mutations invalidate the shared global cache so scraper loops pick up
changes within the next TTL window (≤120s) without a restart.
"""

import asyncio
import logging
from typing import Any

logger = logging.getLogger("GlobalKeywords")


def _bust_cache() -> None:
    """Remove the global keywords entry from the in-process cache."""
    from app.core.supabase_config import _cache
    _cache.pop("global:target_keywords", None)


async def list_global_keywords(supabase: Any) -> list[dict]:
    """Return all rows from global_keywords (active and inactive)."""
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("global_keywords")
            .select("id, keyword, active, created_at, updated_at")
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.error(f"Failed to list global_keywords: {e}")
        return []


async def add_keyword(supabase: Any, keyword: str) -> dict:
    """Insert a new keyword (active by default). Busts cache on success."""
    resp = await asyncio.to_thread(
        lambda: supabase.table("global_keywords")
        .insert({"keyword": keyword, "active": True})
        .execute()
    )
    _bust_cache()
    data = resp.data or []
    return data[0] if data else {}


async def toggle_keyword(supabase: Any, keyword_id: str, active: bool) -> dict:
    """Set the active flag on a keyword. Busts cache on success."""
    resp = await asyncio.to_thread(
        lambda: supabase.table("global_keywords")
        .update({"active": active})
        .eq("id", keyword_id)
        .execute()
    )
    _bust_cache()
    data = resp.data or []
    return data[0] if data else {}


async def delete_keyword(supabase: Any, keyword_id: str) -> None:
    """Hard-delete a keyword row. Busts cache."""
    await asyncio.to_thread(
        lambda: supabase.table("global_keywords")
        .delete()
        .eq("id", keyword_id)
        .execute()
    )
    _bust_cache()
