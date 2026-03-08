"""
Job analysis cache and queue management using Supabase tables.

This centralizes AI analysis at the job description level (by external_id),
avoiding duplicate DeepSeek API calls when multiple users see the same job.
"""

import asyncio
import json
import logging
from typing import Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger("JobQueue")


async def get_cache_entry(supabase: Any, external_id: str) -> Optional[dict]:
    """Fetch a cache entry from job_analysis_cache by external_id."""
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("job_analysis_cache")
            .select("*")
            .eq("external_id", external_id)
            .limit(1)
            .execute()
        )
        if resp.data:
            row = resp.data[0]
            # Deserialize analysis JSON if stored as string
            if row.get("analysis") and isinstance(row["analysis"], str):
                try:
                    row["analysis"] = json.loads(row["analysis"])
                except (json.JSONDecodeError, TypeError):
                    pass
            return row
        return None
    except Exception as e:
        logger.error(f"get_cache_entry failed for {external_id}: {e}")
        return None


async def create_cache_entry(
    supabase: Any, external_id: str, job_url: str
) -> bool:
    """Create a cache entry (ignore if already exists via ON CONFLICT)."""
    try:
        row = {
            "external_id": external_id,
            "job_url": job_url,
            "analysis_status": "pending",
        }
        await asyncio.to_thread(
            lambda: supabase.table("job_analysis_cache")
            .upsert(row, on_conflict="external_id")
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"create_cache_entry failed for {external_id}: {e}")
        return False


async def write_analysis_to_cache(
    supabase: Any,
    external_id: str,
    analysis: dict,
    salary: Optional[str],
    visa: Optional[str],
) -> bool:
    """Update cache entry with completed analysis results."""
    try:
        updates = {
            "analysis": json.dumps(analysis) if analysis else None,
            "analysis_status": "completed",
            "salary": salary,
            "visa": visa,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }
        await asyncio.to_thread(
            lambda: supabase.table("job_analysis_cache")
            .update(updates)
            .eq("external_id", external_id)
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"write_analysis_to_cache failed for {external_id}: {e}")
        return False


async def mark_cache_unavailable(supabase: Any, external_id: str) -> bool:
    """Mark cache entry as unavailable (analysis failed after retries)."""
    try:
        updates = {
            "analysis_status": "unavailable",
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }
        await asyncio.to_thread(
            lambda: supabase.table("job_analysis_cache")
            .update(updates)
            .eq("external_id", external_id)
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"mark_cache_unavailable failed for {external_id}: {e}")
        return False


async def enqueue_job(
    supabase: Any, external_id: str, job_url: str
) -> bool:
    """Enqueue a job for analysis (ignore if already enqueued via UNIQUE constraint)."""
    try:
        row = {
            "external_id": external_id,
            "job_url": job_url,
            "status": "pending",
            "retry_count": 0,
            "max_retries": 3,
        }
        await asyncio.to_thread(
            lambda: supabase.table("job_analysis_queue")
            .upsert(row, on_conflict="external_id")
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"enqueue_job failed for {external_id}: {e}")
        return False
