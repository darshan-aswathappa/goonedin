"""
Data access for the shared `greenhouse_jobs` pool.

The crawler writes fresh jobs here once (deduped by external_id). The per-user
matcher reads jobs discovered since its last run and fans matching ones into
each user's scraped_jobs. Analysis is not stored here — it lives in the shared
job_analysis_cache, keyed by the same external_id.
"""

import asyncio
import logging
from typing import Any

from postgrest import CountMethod, ReturnMethod

from app.services.scraper_greenhouse import ParsedJob

logger = logging.getLogger("GreenhouseJobs")


async def upsert_greenhouse_job(
    supabase: Any,
    job: ParsedJob,
    content: str,
    board_slug: str,
) -> bool:
    """Insert a job into the shared pool if new. Returns True only when a row
    was actually inserted (so the crawler enqueues analysis exactly once).

    Uses ignore_duplicates so re-seeing a job never rewrites it or re-triggers
    analysis. `crawled_at` defaults to now() in the DB.

    `board_slug` must be the registry slug the job was fetched from — it is an
    FK to greenhouse_boards. Don't derive it from absolute_url: boards with a
    custom careers domain (e.g. company.com/careers?gh_jid=...) yield a value
    that isn't a registered slug and the insert fails the FK.
    """
    row = {
        "external_id": job.external_id,
        "board_slug": board_slug,
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
            .upsert(
                row,
                on_conflict="external_id",
                ignore_duplicates=True,
                returning=ReturnMethod.minimal,
                count=CountMethod.exact,
            )
            .execute()
        )
        return bool(resp.count)
    except Exception as e:
        logger.error(f"upsert_greenhouse_job failed for {job.external_id}: {e}")
        return False


async def get_known_ids(supabase: Any, external_ids: list[int]) -> set[int]:
    """Return which of `external_ids` are already in the shared pool.

    Lets the crawler skip re-downloading and re-upserting descriptions for jobs
    it saw in earlier rounds. On error returns an empty set, which just falls
    back to the upsert's own dedup.
    """
    if not external_ids:
        return set()
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("greenhouse_jobs")
            .select("external_id")
            .in_("external_id", external_ids)
            .execute()
        )
        return {int(r["external_id"]) for r in (resp.data or [])}
    except Exception as e:
        logger.error(f"get_known_ids failed: {e}")
        return set()


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
