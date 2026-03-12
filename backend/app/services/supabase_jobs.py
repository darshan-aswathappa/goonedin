"""
Job persistence layer backed by Supabase's `scraped_jobs` table.
Replaces all Redis seen_job:* and job_analysis:* operations.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from app.core.supabase_retry import retry_supabase

logger = logging.getLogger("SupabaseJobs")

# Last-known-good cache for job reads to prevent brief "empty" flashes on transient DB failures
_jobs_cache: dict[str, list] = {}


async def is_already_seen(
    supabase: Any, user_id: str, source: str, external_id: str
) -> bool:
    """Check if a job has already been scraped for this user."""
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .select("id")
            .eq("user_id", user_id)
            .eq("source", source)
            .eq("external_id", external_id)
            .limit(1)
            .execute()
        )
        return bool(resp.data)
    except Exception as e:
        logger.warning(f"is_already_seen check failed: {e}")
        return False


async def upsert_job(
    supabase: Any,
    user_id: str,
    job_data: dict,
    ttl_seconds: Optional[int] = None,
) -> dict:
    """
    Insert or update a scraped job. Sets expires_at based on ttl_seconds.
    Returns the upserted row.
    """
    expires_at = None
    if ttl_seconds and ttl_seconds > 0:
        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        ).isoformat()

    row = {
        "user_id": user_id,
        "source": job_data.get("source", ""),
        "external_id": job_data.get("external_id", ""),
        "title": job_data.get("title", ""),
        "company": job_data.get("company", ""),
        "location": job_data.get("location", ""),
        "url": job_data.get("url", ""),
        "posted_at": job_data.get("posted_at"),
        "visible": job_data.get("visible", False),
        "is_notified": job_data.get("is_notified", False),
        "salary": job_data.get("salary"),
        "visa": job_data.get("visa"),
        "analysis": json.dumps(job_data["analysis"]) if job_data.get("analysis") else None,
        "analysis_status": job_data.get("analysis_status"),
    }
    if expires_at:
        row["expires_at"] = expires_at

    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .upsert(row, on_conflict="user_id,source,external_id")
            .execute()
        )
        return resp.data[0] if resp.data else row
    except Exception as e:
        logger.error(f"upsert_job failed: {e}")
        return row


async def insert_job_if_new(
    supabase: Any,
    user_id: str,
    job_data: dict,
    ttl_seconds: Optional[int] = None,
) -> Optional[dict]:
    """
    Insert a scraped job only if it doesn't already exist (ignore duplicates).
    Never overwrites an existing row — dismissed jobs stay dismissed.
    Returns the inserted row, or None if the row already existed.
    """
    expires_at = None
    if ttl_seconds and ttl_seconds > 0:
        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        ).isoformat()

    row = {
        "user_id": user_id,
        "source": job_data.get("source", ""),
        "external_id": job_data.get("external_id", ""),
        "title": job_data.get("title", ""),
        "company": job_data.get("company", ""),
        "location": job_data.get("location", ""),
        "url": job_data.get("url", ""),
        "posted_at": job_data.get("posted_at"),
        "visible": job_data.get("visible", False),
        "is_notified": job_data.get("is_notified", False),
        "salary": job_data.get("salary"),
        "visa": job_data.get("visa"),
        "analysis": json.dumps(job_data["analysis"]) if job_data.get("analysis") else None,
        "analysis_status": job_data.get("analysis_status"),
    }
    if expires_at:
        row["expires_at"] = expires_at

    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .upsert(row, on_conflict="user_id,source,external_id", ignore_duplicates=True)
            .execute()
        )
        return resp.data[0] if resp.data else None
    except Exception as e:
        logger.error(f"insert_job_if_new failed: {e}")
        return None


async def update_job(
    supabase: Any,
    user_id: str,
    source: str,
    external_id: str,
    updates: dict,
) -> bool:
    """Update specific fields on a scraped job."""
    try:
        # Serialize analysis if present
        if "analysis" in updates and updates["analysis"] is not None:
            updates["analysis"] = json.dumps(updates["analysis"])

        await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .update(updates)
            .eq("user_id", user_id)
            .eq("source", source)
            .eq("external_id", external_id)
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"update_job failed: {e}")
        return False


async def get_job(
    supabase: Any, user_id: str, source: str, external_id: str
) -> Optional[dict]:
    """Fetch a single job by its unique key."""
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .select("*")
            .eq("user_id", user_id)
            .eq("source", source)
            .eq("external_id", external_id)
            .limit(1)
            .execute()
        )
        if resp.data:
            row = resp.data[0]
            if isinstance(row.get("analysis"), str):
                try:
                    row["analysis"] = json.loads(row["analysis"])
                except (json.JSONDecodeError, TypeError):
                    pass
            return row
        return None
    except Exception as e:
        logger.error(f"get_job failed: {e}")
        return None


async def get_all_jobs(supabase: Any, user_id: str) -> list[dict]:
    """Fetch all visible, non-expired jobs for a user."""
    try:
        now_iso = datetime.now(timezone.utc).isoformat()

        def _fetch():
            return supabase.table("scraped_jobs") \
                .select("*") \
                .eq("user_id", user_id) \
                .eq("visible", True) \
                .order("created_at", desc=True) \
                .execute()

        resp = await retry_supabase(_fetch)
        jobs = []
        for row in (resp.data or []):
            # Skip expired jobs
            if row.get("expires_at") and row["expires_at"] < now_iso:
                continue
            # Deserialize analysis JSON if stored as string
            if isinstance(row.get("analysis"), str):
                try:
                    row["analysis"] = json.loads(row["analysis"])
                except (json.JSONDecodeError, TypeError):
                    pass
            jobs.append(row)
        # Update cache on success
        _jobs_cache[user_id] = jobs
        return jobs
    except Exception as e:
        logger.error(f"get_all_jobs failed after retries: {e}")
        # Fall back to last-known-good cache if available
        cached = _jobs_cache.get(user_id)
        if cached is not None:
            logger.warning(f"Returning {len(cached)} cached jobs for user {user_id}")
            return cached
        return []


async def dismiss_job(
    supabase: Any, user_id: str, source: str, external_id: str
) -> bool:
    """Mark a job as not visible (dismiss)."""
    return await update_job(supabase, user_id, source, external_id, {"visible": False})


async def delete_jobs_by_company(
    supabase: Any, user_id: str, company: str
) -> list[str]:
    """Soft-delete all jobs from a specific company by setting visible=False. Returns list of affected external_ids."""
    try:
        # Find matching jobs first
        resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .select("external_id, company")
            .eq("user_id", user_id)
            .execute()
        )
        to_hide = []
        for row in (resp.data or []):
            job_company = (row.get("company") or "").lower()
            if company.lower() in job_company or job_company == company.lower():
                to_hide.append(row["external_id"])

        if to_hide:
            await asyncio.to_thread(
                lambda: supabase.table("scraped_jobs")
                .update({"visible": False})
                .eq("user_id", user_id)
                .in_("external_id", to_hide)
                .execute()
            )
        return to_hide
    except Exception as e:
        logger.error(f"delete_jobs_by_company failed: {e}")
        return []


async def cleanup_expired_jobs(supabase: Any) -> int:
    """Soft-delete scraped_jobs where expires_at has passed."""
    now_iso = datetime.now(timezone.utc).isoformat()
    soft_deleted = 0
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .update({"visible": False})
            .eq("visible", True)           # skip already-hidden
            .lt("expires_at", now_iso)
            .not_.is_("expires_at", "null")
            .execute()
        )
        if resp.data:
            soft_deleted = len(resp.data)
        if soft_deleted:
            logger.info(f"Soft-deleted {soft_deleted} expired scraped jobs")
    except Exception as e:
        logger.error(f"Failed to soft-delete expired scraped jobs: {e}")
    return soft_deleted


async def cleanup_old_invisible_jobs(supabase: Any) -> int:
    """Hard-delete scraped_jobs rows where visible=False AND created_at older than 60 days."""
    deleted = 0
    cutoff = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .delete()
            .eq("visible", False)
            .lt("created_at", cutoff)
            .execute()
        )
        if resp.data:
            deleted = len(resp.data)
        if deleted:
            logger.info(f"Hard-deleted {deleted} old invisible scraped jobs (>60 days)")
    except Exception as e:
        logger.error(f"Failed to hard-delete old invisible scraped jobs: {e}")
    return deleted


async def get_users_with_pending_job(
    supabase: Any, external_id: str
) -> list[str]:
    """Get all distinct user_ids that have a pending (visible=False) job with this external_id."""
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .select("user_id, source")
            .eq("external_id", external_id)
            .eq("visible", False)
            .execute()
        )
        seen = set()
        res = []
        for row in (resp.data or []):
            k = (row["user_id"], row["source"])
            if k not in seen:
                seen.add(k)
                res.append({"user_id": row["user_id"], "source": row["source"]})
        return res
    except Exception as e:
        logger.error(f"get_users_with_pending_job failed: {e}")
        return []


async def bulk_apply_analysis(
    supabase: Any,
    external_id: str,
    analysis: dict,
    salary: Optional[str],
    visa: Optional[str],
) -> bool:
    """Update all LinkedIn jobs with this external_id to visible=True and attach analysis."""
    try:
        updates = {
            "visible": True,
            "analysis": json.dumps(analysis) if analysis else None,
            "analysis_status": "completed",
            "salary": salary,
            "visa": visa,
        }
        await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .update(updates)
            .eq("external_id", external_id)
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"bulk_apply_analysis failed: {e}")
        return False


async def bulk_mark_unavailable(supabase: Any, external_id: str) -> bool:
    """Mark all LinkedIn jobs with this external_id as visible=True but analysis_status=unavailable."""
    try:
        updates = {
            "visible": True,
            "analysis_status": "unavailable",
        }
        await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .update(updates)
            .eq("external_id", external_id)
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"bulk_mark_unavailable failed: {e}")
        return False


async def get_users_without_resume_match(
    supabase: Any, external_id: str
) -> list[str]:
    """Get all user_ids that have this LinkedIn job but no resume_match yet."""
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .select("user_id")
            .eq("external_id", external_id)
            .eq("source", "LinkedIn")
            .is_("resume_match", "null")
            .execute()
        )
        return [row["user_id"] for row in (resp.data or [])]
    except Exception as e:
        logger.error(f"get_users_without_resume_match failed: {e}")
        return []


async def update_job_resume_match(
    supabase: Any,
    user_id: str,
    external_id: str,
    resume_match: dict,
) -> bool:
    """Store the best-matching resume result on a user's scraped_jobs row.
    resume_match is passed as a dict — PostgREST handles JSONB natively.
    """
    try:
        await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .update({"resume_match": resume_match})
            .eq("user_id", user_id)
            .eq("external_id", external_id)
            .eq("source", "LinkedIn")
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"update_job_resume_match failed for {user_id}/{external_id}: {e}")
        return False
