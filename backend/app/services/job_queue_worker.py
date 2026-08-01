"""
Global job analysis queue worker.

Polls the job_analysis_queue table and processes jobs concurrently
with exponential backoff retries. When analysis completes, broadcasts
to all users with that job pending.
"""

import asyncio
import logging
from typing import Any
from datetime import datetime, timezone, timedelta

from app.core.config import get_settings
from app.api.websocket import manager
from app.services.job_analyzer import run_job_analysis
from app.services.job_queue import (
    write_analysis_to_cache,
    mark_cache_unavailable,
)
from app.services.supabase_jobs import (
    get_job,
    get_users_with_pending_job,
    bulk_apply_analysis,
    bulk_mark_unavailable,
)

logger = logging.getLogger("JobQueueWorker")
settings = get_settings()

# Global semaphore to limit concurrency
semaphore: asyncio.Semaphore = None

# In-memory store for pre-fetched descriptions (e.g. Indeed jobs).
# Keyed by external_id. Consumed (popped) once by the worker — no persistence needed.
_prefetched_descriptions: dict[str, str] = {}


def store_description(external_id: str, description: str) -> None:
    """Store a pre-fetched description for the worker to pick up."""
    _prefetched_descriptions[external_id] = description


def pop_description(external_id: str) -> str | None:
    """Retrieve and remove a pre-fetched description."""
    return _prefetched_descriptions.pop(external_id, None)


async def process_job_analysis_queue(supabase: Any):
    """Main queue worker loop. Polls and processes jobs with concurrency control."""
    global semaphore
    semaphore = asyncio.Semaphore(settings.ANALYSIS_WORKER_CONCURRENCY)

    # On startup: reset any rows stuck in 'processing' from a previous crash/restart
    try:
        await asyncio.to_thread(
            lambda: supabase.table("job_analysis_queue")
            .update({"status": "pending"})
            .eq("status", "processing")
            .execute()
        )
        logger.info("[JobQueue] Reset any stuck processing rows on startup")
    except Exception as e:
        logger.error(f"[JobQueue] Failed to reset stuck rows: {e}")

    while True:
        try:
            # Poll for pending jobs that are ready to be retried
            now_iso = datetime.now(timezone.utc).isoformat()
            rows = await asyncio.to_thread(
                lambda: supabase.table("job_analysis_queue")
                .select("*")
                .eq("status", "pending")
                .lte("next_retry_at", now_iso)
                .limit(1)  # Process one job at a time
                .execute()
            )
            rows_data = rows.data or []

            if rows_data:
                logger.debug(f"[JobQueue] Polled {len(rows_data)} pending jobs")
                for row in rows_data:
                    await _process_one(supabase, row)  # Sequential: await each job

        except Exception as e:
            logger.error(f"[JobQueue] Poll error: {e}")

        await asyncio.sleep(5)


async def _process_one(supabase: Any, row: dict):
    """Process a single job from the queue."""
    async with semaphore:
        external_id = row["external_id"]
        job_url = row["job_url"]
        queue_id = row["id"]
        error_reason = None

        try:
            # Optimistic lock: mark as processing
            updated = await asyncio.to_thread(
                lambda: supabase.table("job_analysis_queue")
                .update({"status": "processing", "updated_at": datetime.now(timezone.utc).isoformat()})
                .eq("id", queue_id)
                .eq("status", "pending")
                .execute()
            )
            if not updated.data:
                # Another worker already got this job
                return

            logger.info(f"[JobQueue] Processing analysis for job {external_id}")

            # IMPORTANT: Capture pending targets BEFORE bulk update
            # (they're visible=FALSE now; after bulk update they'll be TRUE)
            pending_targets = await get_users_with_pending_job(supabase, external_id)

            # Check for pre-fetched description (e.g. Indeed jobs already have it)
            pre_description = pop_description(external_id)

            # Run analysis
            analysis, error_reason = await run_job_analysis(
                external_id, job_url, settings.DEEPSEEK_API_KEY,
                description=pre_description,
            )

            if analysis:
                # Extract salary, visa and min experience from analysis result
                salary = analysis.pop("compensation", None)
                visa = analysis.pop("visa_status", None)
                min_exp_raw = analysis.pop("min_experience_years", None)
                try:
                    min_exp = int(min_exp_raw) if min_exp_raw is not None else None
                except (TypeError, ValueError):
                    min_exp = None

                # Write to global cache
                logger.info(f"[JobQueue] Analysis successful for {external_id}, calling write_analysis_to_cache...")
                cache_result = await write_analysis_to_cache(supabase, external_id, job_url, analysis, salary, visa, min_exp)
                logger.info(f"[JobQueue] write_analysis_to_cache returned {cache_result} for {external_id}")

                # Bulk update all user rows for this job
                await bulk_apply_analysis(supabase, external_id, analysis, salary, visa, min_exp)

                # Notify all affected users
                for t in pending_targets:
                    user_id = t["user_id"]
                    source = t["source"]
                    job_dict = await get_job(supabase, user_id, source, external_id)
                    if job_dict:
                        logger.info(f"[JobQueue] Broadcasting NEW_JOB for {external_id} to user {user_id}")
                        await manager.broadcast(user_id, {"type": "NEW_JOB", "data": job_dict})

                # Mark queue entry as completed
                await asyncio.to_thread(
                    lambda: supabase.table("job_analysis_queue")
                    .update({"status": "completed", "updated_at": datetime.now(timezone.utc).isoformat()})
                    .eq("id", queue_id)
                    .execute()
                )
                logger.info(f"[JobQueue] Analysis completed for job {external_id}")

            else:
                # Analysis failed — check retry logic
                retry_count = row.get("retry_count", 0)
                max_retries = row.get("max_retries", 3)
                next_retry = retry_count + 1

                if next_retry < max_retries:
                    # Exponential backoff: 30s, 60s, 120s, 300s
                    delay_seconds = min(30 * (2 ** retry_count), 600)
                    next_retry_at = (
                        datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
                    ).isoformat()

                    await asyncio.to_thread(
                        lambda: supabase.table("job_analysis_queue")
                        .update({
                            "status": "pending",
                            "retry_count": next_retry,
                            "next_retry_at": next_retry_at,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        })
                        .eq("id", queue_id)
                        .execute()
                    )
                    logger.info(
                        f"[JobQueue] Retrying {external_id} "
                        f"(attempt {next_retry}/{max_retries}, backoff {delay_seconds}s)"
                    )

                else:
                    # Max retries exceeded — mark unavailable
                    await mark_cache_unavailable(supabase, external_id)
                    await bulk_mark_unavailable(supabase, external_id)

                    # Notify all affected users
                    for t in pending_targets:
                        user_id = t["user_id"]
                        source = t["source"]
                        job_dict = await get_job(supabase, user_id, source, external_id)
                        if job_dict:
                            logger.info(f"[JobQueue] Broadcasting unavailable job {external_id} to user {user_id}")
                            await manager.broadcast(user_id, {"type": "NEW_JOB", "data": job_dict})

                    # Mark queue entry as failed with error reason
                    await asyncio.to_thread(
                        lambda: supabase.table("job_analysis_queue")
                        .update({"status": "failed", "error": error_reason or "Max retries exceeded", "updated_at": datetime.now(timezone.utc).isoformat()})
                        .eq("id", queue_id)
                        .execute()
                    )
                    logger.error(f"[JobQueue] Analysis FAILED for job {external_id} after {max_retries} attempts. Reason: {error_reason}")

        except Exception as e:
            logger.error(f"[JobQueue] Error processing job {external_id}: {e}")
            # Mark as failed on unexpected error
            try:
                await asyncio.to_thread(
                    lambda: supabase.table("job_analysis_queue")
                    .update({"status": "failed", "error": str(e), "updated_at": datetime.now(timezone.utc).isoformat()})
                    .eq("id", queue_id)
                    .execute()
                )
            except Exception as update_err:
                logger.error(f"[JobQueue] Failed to mark job as failed: {update_err}")
