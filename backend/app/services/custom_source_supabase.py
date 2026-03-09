"""
Supabase CRUD operations for the Custom Source module.

Custom sources are stored and managed via Supabase.
for both config storage and scraped job results.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from app.core.supabase_retry import retry_supabase

logger = logging.getLogger("CustomSourceSupabase")

# Last-known-good cache for custom job reads to prevent brief "empty" flashes on transient DB failures
_custom_jobs_cache: dict[str, list] = {}
_custom_sources_cache: dict[str, list] = {}


# ---------------------------------------------------------------------------
# Source Config CRUD
# ---------------------------------------------------------------------------

async def get_custom_sources(supabase: Any, user_id: str) -> list[dict]:
    """Fetch all custom sources for a user."""
    try:
        def _fetch():
            return supabase.table("custom_sources") \
                .select("*") \
                .eq("user_id", user_id) \
                .order("created_at") \
                .execute()

        resp = await retry_supabase(_fetch)
        result = resp.data or []
        # Update cache on success
        _custom_sources_cache[user_id] = result
        return result
    except Exception as e:
        logger.error(f"Failed to fetch custom sources after retries: {e}")
        # Fall back to cache if available
        cached = _custom_sources_cache.get(user_id)
        if cached is not None:
            logger.warning(f"Returning {len(cached)} cached custom sources for user {user_id}")
            return cached
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

        # Skip if job already exists for this source
        if ext_id in existing_ids:
            logger.debug(f"Job {ext_id} already exists for source {source_id}, skipping")
            continue

        # Only insert new jobs
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
                .insert(r)
                .execute()
            )
            if resp.data:
                new_jobs.append(resp.data[0])
        except Exception as e:
            logger.warning(f"Failed to insert job {ext_id}: {e}")
    return new_jobs


async def get_custom_jobs(supabase: Any, user_id: str) -> list[dict]:
    """Fetch all visible custom source jobs for a user."""
    try:
        def _fetch():
            return supabase.table("custom_source_jobs") \
                .select("*") \
                .eq("user_id", user_id) \
                .eq("visible", True) \
                .order("created_at", desc=True) \
                .execute()

        resp = await retry_supabase(_fetch)
        result = resp.data or []
        # Update cache on success
        _custom_jobs_cache[user_id] = result
        return result
    except Exception as e:
        logger.error(f"Failed to fetch custom jobs after retries: {e}")
        # Fall back to cache if available
        cached = _custom_jobs_cache.get(user_id)
        if cached is not None:
            logger.warning(f"Returning {len(cached)} cached custom jobs for user {user_id}")
            return cached
        return []


async def dismiss_custom_job(supabase: Any, user_id: str, external_id: str) -> bool:
    """Soft-delete a custom source job when user dismisses it."""
    try:
        await asyncio.to_thread(
            lambda: supabase.table("custom_source_jobs")
            .update({"visible": False})
            .eq("user_id", user_id)
            .eq("external_id", external_id)
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"Failed to dismiss custom job {external_id}: {e}")
        return False


async def delete_expired_jobs(supabase: Any) -> int:
    """Soft-delete custom_source_jobs older than their source's TTL."""
    soft_deleted = 0
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
                .update({"visible": False})
                .eq("user_id", s["user_id"])
                .eq("source_id", s["id"])
                .eq("visible", True)       # skip already-hidden
                .lt("created_at", c)
                .execute()
            )
            if resp.data:
                soft_deleted += len(resp.data)
        if soft_deleted:
            logger.info(f"Soft-deleted {soft_deleted} expired custom source jobs")
    except Exception as e:
        logger.error(f"Failed to soft-delete expired custom jobs: {e}")
    return soft_deleted


async def cleanup_old_invisible_custom_jobs(supabase: Any) -> int:
    """Hard-delete custom_source_jobs rows where visible=False AND created_at older than 60 days."""
    deleted = 0
    cutoff = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("custom_source_jobs")
            .delete()
            .eq("visible", False)
            .lt("created_at", cutoff)
            .execute()
        )
        if resp.data:
            deleted = len(resp.data)
        if deleted:
            logger.info(f"Hard-deleted {deleted} old invisible custom source jobs (>60 days)")
    except Exception as e:
        logger.error(f"Failed to hard-delete old invisible custom jobs: {e}")
    return deleted
