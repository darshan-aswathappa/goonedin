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
from app.core.title_filter import is_title_blocked

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
        "min_exp": job_data.get("min_exp"),
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
        "min_exp": job_data.get("min_exp"),
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
    all_hidden: list[str] = []
    company_lower = company.lower()

    # 1) Soft-delete from scraped_jobs
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .select("external_id, company")
            .eq("user_id", user_id)
            .eq("visible", True)
            .execute()
        )
        to_hide = []
        for row in (resp.data or []):
            job_company = (row.get("company") or "").lower()
            if company_lower in job_company or job_company == company_lower:
                to_hide.append(row["external_id"])

        if to_hide:
            await asyncio.to_thread(
                lambda: supabase.table("scraped_jobs")
                .update({"visible": False})
                .eq("user_id", user_id)
                .in_("external_id", to_hide)
                .execute()
            )
            all_hidden.extend(to_hide)
    except Exception as e:
        logger.error(f"delete_jobs_by_company (scraped_jobs) failed: {e}")

    # 2) Soft-delete from custom_source_jobs
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("custom_source_jobs")
            .select("external_id, company")
            .eq("user_id", user_id)
            .eq("visible", True)
            .execute()
        )
        to_hide_custom = []
        for row in (resp.data or []):
            job_company = (row.get("company") or "").lower()
            if company_lower in job_company or job_company == company_lower:
                to_hide_custom.append(row["external_id"])

        if to_hide_custom:
            await asyncio.to_thread(
                lambda: supabase.table("custom_source_jobs")
                .update({"visible": False})
                .eq("user_id", user_id)
                .in_("external_id", to_hide_custom)
                .execute()
            )
            all_hidden.extend(to_hide_custom)
    except Exception as e:
        logger.error(f"delete_jobs_by_company (custom_source_jobs) failed: {e}")

    return all_hidden


async def hide_jobs_by_title_keywords(
    supabase: Any, user_id: str, keywords: list[str]
) -> list[str]:
    """Soft-delete every visible job whose title matches a blacklist keyword.

    Called when the user edits their title filter so keywords added after a job
    was ingested still take it off the dashboard. Returns affected external_ids.
    """
    if not keywords:
        return []

    all_hidden: list[str] = []

    for table in ("scraped_jobs", "custom_source_jobs"):
        try:
            resp = await asyncio.to_thread(
                lambda t=table: supabase.table(t)
                .select("external_id, title")
                .eq("user_id", user_id)
                .eq("visible", True)
                .execute()
            )
            to_hide = [
                row["external_id"]
                for row in (resp.data or [])
                if is_title_blocked(row.get("title") or "", keywords)
            ]

            if to_hide:
                await asyncio.to_thread(
                    lambda t=table, ids=to_hide: supabase.table(t)
                    .update({"visible": False})
                    .eq("user_id", user_id)
                    .in_("external_id", ids)
                    .execute()
                )
                all_hidden.extend(to_hide)
        except Exception as e:
            logger.error(f"hide_jobs_by_title_keywords ({table}) failed: {e}")

    if all_hidden:
        logger.info(
            f"Hid {len(all_hidden)} job(s) for user {user_id} after title filter update"
        )
    return all_hidden


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
    min_exp: Optional[int] = None,
) -> bool:
    """Update all LinkedIn jobs with this external_id to visible=True and attach analysis."""
    try:
        updates = {
            "visible": True,
            "analysis": json.dumps(analysis) if analysis else None,
            "analysis_status": "completed",
            "salary": salary,
            "visa": visa,
            "min_exp": min_exp,
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


