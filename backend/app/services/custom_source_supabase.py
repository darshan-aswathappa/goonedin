"""
Supabase CRUD operations for the Custom Source module.

Custom sources are stored and managed via Supabase.
for both config storage and scraped job results.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

logger = logging.getLogger("CustomSourceSupabase")


# ---------------------------------------------------------------------------
# Source Config CRUD
# ---------------------------------------------------------------------------

async def get_custom_sources(supabase: Any, user_id: str) -> list[dict]:
    """Fetch all custom sources for a user."""
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("custom_sources")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at")
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.error(f"Failed to fetch custom sources: {e}")
        return []


async def add_custom_source(supabase: Any, user_id: str, source_data: dict) -> dict:
    """Insert a new custom source. Returns the inserted row."""
    row = {
        "id": source_data["id"],
        "user_id": user_id,
        "name": source_data["name"],
        "icon": source_data["icon"],
        "url": str(source_data["url"]),
        "ttl_hours": source_data.get("ttl_hours", 24),
        "interval_minutes": source_data.get("interval_minutes", 60),
        "disable_javascript": source_data.get("disable_javascript", True),
        "status": "pending",
        "status_message": "Waiting to start...",
    }
    resp = await asyncio.to_thread(
        lambda: supabase.table("custom_sources").insert(row).execute()
    )
    return resp.data[0] if resp.data else row


async def update_custom_source(
    supabase: Any, user_id: str, source_id: str, source_data: dict
) -> dict:
    """Update an existing custom source config."""
    updates = {
        "name": source_data["name"],
        "icon": source_data["icon"],
        "url": str(source_data["url"]),
        "ttl_hours": source_data.get("ttl_hours", 24),
        "interval_minutes": source_data.get("interval_minutes", 60),
        "disable_javascript": source_data.get("disable_javascript", True),
    }
    resp = await asyncio.to_thread(
        lambda: supabase.table("custom_sources")
        .update(updates)
        .eq("user_id", user_id)
        .eq("id", source_id)
        .execute()
    )
    return resp.data[0] if resp.data else {}


async def delete_custom_source(supabase: Any, user_id: str, source_id: str) -> bool:
    """Delete a custom source and all its associated jobs."""
    try:
        # Delete jobs first
        await asyncio.to_thread(
            lambda: supabase.table("custom_source_jobs")
            .delete()
            .eq("user_id", user_id)
            .eq("source_id", source_id)
            .execute()
        )
        # Delete the source
        await asyncio.to_thread(
            lambda: supabase.table("custom_sources")
            .delete()
            .eq("user_id", user_id)
            .eq("id", source_id)
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"Failed to delete custom source {source_id}: {e}")
        return False


async def update_source_status(
    supabase: Any, source_id: str, user_id: str,
    status: str, message: Optional[str] = None,
    set_last_scraped: bool = False,
) -> None:
    """Update processing status for a custom source."""
    updates: dict[str, Any] = {"status": status}
    if message is not None:
        updates["status_message"] = message
    if set_last_scraped:
        updates["last_scraped_at"] = datetime.now(timezone.utc).isoformat()
    try:
        await asyncio.to_thread(
            lambda: supabase.table("custom_sources")
            .update(updates)
            .eq("user_id", user_id)
            .eq("id", source_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Failed to update status for source {source_id}: {e}")


# ---------------------------------------------------------------------------
# Job CRUD
# ---------------------------------------------------------------------------

async def upsert_custom_jobs(
    supabase: Any, user_id: str, source_id: str, source_name: str,
    jobs: list[dict],
) -> list[dict]:
    """
    Upsert scraped jobs into the custom_source_jobs table.
    Returns list of newly inserted jobs (not duplicates).
    """
    if not jobs:
        return []

    # Get existing external_ids for this source
    try:
        existing_resp = await asyncio.to_thread(
            lambda: supabase.table("custom_source_jobs")
            .select("external_id")
            .eq("user_id", user_id)
            .eq("source_id", source_id)
            .execute()
        )
        existing_ids = {row["external_id"] for row in (existing_resp.data or [])}
    except Exception as e:
        logger.warning(f"Failed to fetch existing external_ids for {source_id}: {e}")
        existing_ids = set()

    new_jobs: list[dict] = []
    for job in jobs:
        ext_id = job.get("external_id", "")
        row = {
            "user_id": user_id,
            "source_id": source_id,
            "external_id": ext_id,
            "title": job.get("title", ""),
            "company": job.get("company", ""),
            "location": job.get("location", ""),
            "url": job.get("url", ""),
            "source_name": source_name,
            "posted_at": job.get("posted_at") or datetime.now(timezone.utc).isoformat(),
            "visible": True,
        }
        try:
            resp = await asyncio.to_thread(
                lambda r=row: supabase.table("custom_source_jobs")
                .upsert(r, on_conflict="user_id,source_id,external_id")
                .execute()
            )
            # Only add to new_jobs if it didn't previously exist
            if resp.data and ext_id not in existing_ids:
                new_jobs.append(resp.data[0])
        except Exception as e:
            logger.warning(f"Failed to upsert job {ext_id}: {e}")
    return new_jobs


async def get_custom_jobs(supabase: Any, user_id: str) -> list[dict]:
    """Fetch all visible custom source jobs for a user."""
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("custom_source_jobs")
            .select("*")
            .eq("user_id", user_id)
            .eq("visible", True)
            .order("created_at", desc=True)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.error(f"Failed to fetch custom jobs: {e}")
        return []


async def delete_expired_jobs(supabase: Any) -> int:
    """
    Delete custom source jobs older than their source's TTL.
    Called periodically from the custom sources loop.
    Returns number of deleted jobs.
    """
    deleted = 0
    try:
        # Get all sources with their TTL
        sources_resp = await asyncio.to_thread(
            lambda: supabase.table("custom_sources")
            .select("id,user_id,ttl_hours")
            .execute()
        )
        for src in (sources_resp.data or []):
            cutoff = (
                datetime.now(timezone.utc) - timedelta(hours=src["ttl_hours"])
            ).isoformat()
            resp = await asyncio.to_thread(
                lambda c=cutoff, s=src: supabase.table("custom_source_jobs")
                .delete()
                .eq("user_id", s["user_id"])
                .eq("source_id", s["id"])
                .lt("created_at", c)
                .execute()
            )
            if resp.data:
                deleted += len(resp.data)
        if deleted:
            logger.info(f"Cleaned up {deleted} expired custom source jobs")
    except Exception as e:
        logger.error(f"Failed to delete expired custom jobs: {e}")
    return deleted
