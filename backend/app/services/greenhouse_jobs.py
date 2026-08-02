"""
Data access for the shared `greenhouse_jobs` pool.

The crawler writes fresh jobs here once (deduped by external_id). The per-user
matcher reads jobs discovered since its last run and fans matching ones into
each user's scraped_jobs. Analysis is not stored here — it lives in the shared
job_analysis_cache, keyed by the same external_id.
"""

import asyncio
import logging
from typing import Any, Optional

from app.services.scraper_greenhouse import ParsedJob

logger = logging.getLogger("GreenhouseJobs")


async def upsert_greenhouse_job(
    supabase: Any,
    job: ParsedJob,
    content: str,
) -> bool:
    """Insert a job into the shared pool if new. Returns True only when a row
    was actually inserted (so the crawler enqueues analysis exactly once).

    Uses ignore_duplicates so re-seeing a job never rewrites it or re-triggers
    analysis. `crawled_at` defaults to now() in the DB.
    """
    row = {
        "external_id": job.external_id,
        "board_slug": _board_from_url(job) or job.company_name,
        "title": job.title,
        "company_name": job.company_name,
        "location_raw": job.location_raw,
        "url": job.url,
        "first_published": job.first_published.isoformat() if job.first_published else None,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
        "content": content or None,
    }
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("greenhouse_jobs")
            .upsert(row, on_conflict="external_id", ignore_duplicates=True)
            .execute()
        )
        return bool(resp.data)
    except Exception as e:
        logger.error(f"upsert_greenhouse_job failed for {job.external_id}: {e}")
        return False


def _board_from_url(job: ParsedJob) -> Optional[str]:
    """Best-effort board slug from the absolute_url path (.../{slug}/jobs/{id})."""
    try:
        parts = job.url.split("/")
        idx = parts.index("jobs")
        return parts[idx - 1] or None
    except (ValueError, IndexError):
        return None


async def get_jobs_since(
    supabase: Any,
    since_iso: str,
    limit: int = 500,
) -> list[dict]:
    """Return pool jobs with crawled_at strictly greater than `since_iso`,
    oldest first, so the matcher can advance its cursor deterministically.
    """
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("greenhouse_jobs")
            .select("external_id, title, company_name, location_raw, url, first_published, crawled_at")
            .gt("crawled_at", since_iso)
            .order("crawled_at", desc=False)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.error(f"get_jobs_since failed: {e}")
        return []
