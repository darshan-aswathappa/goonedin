"""
Job analysis cache and queue management using Supabase tables.

This centralizes AI analysis at the job description level (by external_id),
avoiding duplicate DeepSeek API calls when multiple users see the same job.

Embedding hook:
  write_analysis_to_cache() calls knowledge_base_service.embed_text() after
  a successful cache write.  Embedding failure is non-fatal — it is logged
  and silently skipped so a transient OpenAI error never blocks job analysis.
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
            .upsert(row, on_conflict="external_id", ignore_duplicates=True)
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"create_cache_entry failed for {external_id}: {e}")
        return False


async def write_analysis_to_cache(
    supabase: Any,
    external_id: str,
    job_url: str,
    analysis: dict,
    salary: Optional[str],
    visa: Optional[str],
) -> bool:
    """Write (or create) cache entry with completed analysis results.

    After a successful Supabase upsert, attempts to generate and store an
    embedding for the job via knowledge_base_service.  Embedding failure is
    intentionally non-fatal — it is logged at WARNING level and silently
    skipped so a transient OpenAI error never blocks job analysis delivery.
    """
    try:
        logger.info(f"[CacheWrite] Starting write_analysis_to_cache for {external_id}")
        row = {
            "external_id": external_id,
            "job_url": job_url,
            "analysis": json.dumps(analysis) if analysis else None,
            "analysis_status": "completed",
            "salary": salary,
            "visa": visa,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.debug(f"[CacheWrite] Row data: {row}")
        result = await asyncio.to_thread(
            lambda: supabase.table("job_analysis_cache")
            .upsert(row, on_conflict="external_id")
            .execute()
        )
        logger.info(f"[CacheWrite] Successfully wrote cache for {external_id}. Result: {result}")

        # ---- Embedding: non-blocking, non-fatal ----
        # Import here (not at module top) to avoid a circular import at cold start,
        # because knowledge_base_service itself imports from config which imports
        # nothing from services.  The lazy import is also guarded by a try/except
        # so a missing OPENAI_API_KEY or import error is fully silent.
        try:
            from app.services.knowledge_base_service import (
                build_job_embedding_text,
                embed_text,
            )
            from app.core.config import get_settings
            _settings = get_settings()
            if _settings.OPENAI_API_KEY:
                embed_record = {
                    "external_id": external_id,
                    "job_url": job_url,
                    "analysis": json.dumps(analysis) if analysis else None,
                    "salary": salary,
                    "visa": visa,
                }
                text = build_job_embedding_text(embed_record)
                if text.strip():
                    vector = await embed_text(text)
                    if vector is not None:
                        # Write embedding back via direct Supabase upsert.
                        # We store the vector as a JSON array string; pgvector
                        # accepts text input cast to vector type.
                        import json as _json
                        vector_str = _json.dumps(vector)
                        await asyncio.to_thread(
                            lambda: supabase.table("job_analysis_cache")
                            .update({"embedding": vector_str})
                            .eq("external_id", external_id)
                            .execute()
                        )
                        logger.debug(
                            f"[CacheWrite] Embedding stored for {external_id} "
                            f"({len(vector)} dims)"
                        )
        except Exception as embed_err:
            # Non-fatal — analysis is already persisted above
            logger.warning(
                f"[CacheWrite] Embedding failed for {external_id} (non-fatal): {embed_err}"
            )

        return True
    except Exception as e:
        logger.error(f"[CacheWrite] write_analysis_to_cache FAILED for {external_id}: {e}", exc_info=True)
        return False


async def mark_cache_unavailable(supabase: Any, external_id: str) -> bool:
    """Mark cache entry as unavailable (analysis failed after retries)."""
    try:
        row = {
            "external_id": external_id,
            "analysis_status": "unavailable",
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }
        await asyncio.to_thread(
            lambda: supabase.table("job_analysis_cache")
            .upsert(row, on_conflict="external_id")
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"mark_cache_unavailable failed for {external_id}: {e}")
        return False


async def enqueue_job(
    supabase: Any, external_id: str, job_url: str
) -> bool:
    """Enqueue a job for analysis (skip if already completed)."""
    try:
        # Check if already analyzed and cached
        cache_entry = await get_cache_entry(supabase, external_id)
        if cache_entry and cache_entry.get("analysis_status") in ("completed", "processing"):
            logger.debug(f"Job {external_id} already {cache_entry.get('analysis_status')} in cache, skipping re-enqueue")
            return True

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
