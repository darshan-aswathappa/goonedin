"""
Board-registry data access for Greenhouse ingestion.

The registry (`greenhouse_boards`) is seeded from data/greenhouse.json and
carries a per-board crawl cursor so the global crawler can shard work by
"oldest crawled first". Only `status = 'live'` boards are ever fetched.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("GreenhouseBoards")


async def seed_boards(supabase: Any, boards: list[dict]) -> int:
    """Upsert board rows from a parsed greenhouse.json list.

    Each entry looks like:
        {"ats": "greenhouse", "slug": "appflame", "status": "live",
         "last_probed_at": "...", "first_seen_at": "..."}

    Only `slug` and `status` are persisted here; the crawler owns
    last_crawled_at / consecutive_failures, so those are left untouched on
    re-seed (upsert ignores them). Returns the number of rows sent.
    """
    rows = [
        {
            "slug": b["slug"],
            "status": b.get("status", "live"),
            "first_seen_at": b.get("first_seen_at"),
        }
        for b in boards
        if b.get("ats") == "greenhouse" and b.get("slug")
    ]
    if not rows:
        return 0

    # Chunk to keep each upsert request a reasonable size.
    CHUNK = 500
    sent = 0
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i : i + CHUNK]
        try:
            await asyncio.to_thread(
                lambda c=chunk: supabase.table("greenhouse_boards")
                .upsert(c, on_conflict="slug")
                .execute()
            )
            sent += len(chunk)
        except Exception as e:
            logger.error(f"seed_boards chunk {i} failed: {e}")
    logger.info(f"[GreenhouseBoards] Seeded {sent}/{len(rows)} boards")
    return sent


async def get_shard(supabase: Any, limit: int) -> list[dict]:
    """Return the next `limit` live boards to crawl, oldest-crawled first.

    NULL last_crawled_at (never crawled) sorts first, so a fresh registry
    drains evenly before any board is revisited.
    """
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("greenhouse_boards")
            .select("slug, company_name, last_crawled_at, consecutive_failures")
            .eq("status", "live")
            .order("last_crawled_at", desc=False, nullsfirst=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.error(f"get_shard failed: {e}")
        return []


async def mark_crawled(
    supabase: Any,
    slug: str,
    company_name: str | None = None,
) -> None:
    """Stamp a board as successfully crawled (resets failure counter)."""
    updates = {
        "last_crawled_at": datetime.now(timezone.utc).isoformat(),
        "consecutive_failures": 0,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if company_name:
        updates["company_name"] = company_name
    try:
        await asyncio.to_thread(
            lambda: supabase.table("greenhouse_boards")
            .update(updates)
            .eq("slug", slug)
            .execute()
        )
    except Exception as e:
        logger.error(f"mark_crawled failed for {slug}: {e}")


async def mark_failed(supabase: Any, slug: str, current_failures: int, max_failures: int) -> None:
    """Increment a board's failure counter; flip to 'dead' past the threshold.

    Still advances last_crawled_at so a failing board rotates to the back of
    the shard queue instead of being retried every round.
    """
    next_failures = current_failures + 1
    updates: dict[str, Any] = {
        "consecutive_failures": next_failures,
        "last_crawled_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if next_failures >= max_failures:
        updates["status"] = "dead"
        logger.info(f"[GreenhouseBoards] Marking board dead after {next_failures} failures: {slug}")
    try:
        await asyncio.to_thread(
            lambda: supabase.table("greenhouse_boards")
            .update(updates)
            .eq("slug", slug)
            .execute()
        )
    except Exception as e:
        logger.error(f"mark_failed failed for {slug}: {e}")
