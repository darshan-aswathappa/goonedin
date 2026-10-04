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

from postgrest import ReturnMethod

from app.core.supabase_retry import retry_supabase

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
                .upsert(c, on_conflict="slug", returning=ReturnMethod.minimal)
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


def crawled_row(board: dict, company_name: str | None = None) -> dict:
    """Registry row stamping a board as successfully crawled (resets failures)."""
    now = datetime.now(timezone.utc).isoformat()
    return {
        "slug": board["slug"],
        "status": "live",
        "company_name": company_name or board.get("company_name"),
        "last_crawled_at": now,
        "consecutive_failures": 0,
        "updated_at": now,
    }


def failed_row(board: dict, max_failures: int) -> dict:
    """Registry row incrementing a board's failure counter; flips it to 'dead'
    past the threshold.

    Still advances last_crawled_at so a failing board rotates to the back of
    the shard queue instead of being retried every round.
    """
    now = datetime.now(timezone.utc).isoformat()
    next_failures = (board.get("consecutive_failures") or 0) + 1
    dead = next_failures >= max_failures
    if dead:
        logger.info(f"[GreenhouseBoards] Marking board dead after {next_failures} failures: {board['slug']}")
    return {
        "slug": board["slug"],
        "status": "dead" if dead else "live",
        "company_name": board.get("company_name"),
        "last_crawled_at": now,
        "consecutive_failures": next_failures,
        "updated_at": now,
    }


async def save_crawl_results(supabase: Any, rows: list[dict]) -> None:
    """Persist a round's crawl cursors in one upsert.

    One request per round instead of one PATCH per board: ~200 concurrent
    single-row PATCHes each round were ~570k requests/day and kept tripping
    "Server disconnected" on the shared Supabase HTTP/2 connection. Every row
    carries the same keys, so the bulk upsert never nulls a column.
    """
    if not rows:
        return
    try:
        await retry_supabase(
            lambda: supabase.table("greenhouse_boards")
            .upsert(rows, on_conflict="slug", returning=ReturnMethod.minimal)
            .execute()
        )
    except Exception as e:
        logger.error(f"save_crawl_results failed for {len(rows)} boards: {e}")
