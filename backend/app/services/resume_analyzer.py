"""
Resume analysis service — backend orchestration only.
PDF extraction and AI analysis are delegated to the resume microservice.

Uses a Supabase table-based queue for processing resume analysis tasks.
"""

import logging
from typing import Any
import asyncio

import httpx

from app.core.config import get_settings

logger = logging.getLogger("VelocityMain")

QUEUE_TABLE = "resume_analysis_queue"


async def _run_resume_analysis_with_retry(
    resume_id: str,
    user_id: str,
    file_path: str,
    supabase_client: Any,
) -> None:
    """
    Internal resume analysis with retry logic.
    Delegates PDF extraction + AI analysis to the resume microservice.
    """
    settings = get_settings()
    max_retries = 2
    base_delay = 1  # seconds

    for attempt in range(max_retries + 1):
        try:
            logger.info(f"[ResumeAI] Starting analysis for resume {resume_id} (attempt {attempt + 1})")

            # 1. Download PDF from Supabase storage
            def _download_pdf(*args: Any, **kwargs: Any) -> bytes:
                return supabase_client.storage.from_("resumes").download(file_path)

            pdf_bytes: bytes = await asyncio.to_thread(_download_pdf)

            # 2. Call resume microservice for extraction + DeepSeek analysis
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{settings.RESUME_SERVICE_URL}/analyze",
                    files={"file": ("resume.pdf", pdf_bytes, "application/pdf")},
                )
                resp.raise_for_status()
                analysis = resp.json()

            logger.info(f"[ResumeAI] Microservice analysis complete for resume {resume_id}")

            # 3. Store results in resume_analysis table
            def _store_analysis(*args: Any, **kwargs: Any) -> Any:
                return supabase_client.table("resume_analysis").insert(
                    {
                        "resume_id": resume_id,
                        "user_id": user_id,
                        "education": analysis.get("education", []),
                        "certifications": analysis.get("certifications", []),
                        "skills": analysis.get("skills", []),
                        "project_keywords": analysis.get("project_keywords", []),
                        "summary": analysis.get("summary", ""),
                        "raw_response": analysis,
                    }
                ).execute()

            await asyncio.to_thread(_store_analysis)

            # 4. Update status to completed
            def _update_status_completed(*args: Any, **kwargs: Any) -> Any:
                return (
                    supabase_client.table("user_resumes")
                    .update({"analysis_status": "completed"})
                    .eq("id", resume_id)
                    .execute()
                )

            await asyncio.to_thread(_update_status_completed)

            logger.info(f"[ResumeAI] Analysis stored for resume {resume_id}")
            return  # Success

        except Exception as e:
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt)  # Exponential backoff
                logger.warning(
                    f"[ResumeAI] Attempt {attempt + 1} failed for {resume_id}: {e}. "
                    f"Retrying in {delay}s..."
                )
                await asyncio.sleep(delay)
            else:
                logger.error(f"[ResumeAI] All retries exhausted for resume {resume_id}: {e}")
                # Update status to failed
                try:
                    def _update_status_failed(*args: Any, **kwargs: Any) -> Any:
                        return (
                            supabase_client.table("user_resumes")
                            .update({"analysis_status": "failed"})
                            .eq("id", resume_id)
                            .execute()
                        )

                    await asyncio.to_thread(_update_status_failed)
                except Exception as inner_e:
                    logger.error(
                        f"[ResumeAI] Could not update status to failed for {resume_id}: {inner_e}"
                    )
                return


async def enqueue_resume_analysis(
    resume_id: str,
    user_id: str,
    file_path: str,
    supabase_client: Any,
) -> None:
    """
    Enqueue a resume analysis task via Supabase table queue.
    Stores task in resume_analysis_queue table for background processing.
    """
    try:
        def _send_message(*args: Any, **kwargs: Any) -> Any:
            return supabase_client.table(QUEUE_TABLE).insert({
                "resume_id": resume_id,
                "user_id": user_id,
                "file_path": file_path,
                "status": "pending"
            }).execute()

        await asyncio.to_thread(_send_message)
        logger.info(f"[ResumeAI] Enqueued analysis task for resume {resume_id}")
    except Exception as e:
        logger.error(f"[ResumeAI] Failed to enqueue resume analysis: {e}")
        raise


async def process_resume_analysis_queue(
    supabase_client: Any,
) -> None:
    """
    Worker that continuously processes resume analysis tasks from table queue.
    Runs one task at a time to prevent resource exhaustion.
    Designed to run as a background service.
    """
    logger.info(f"[ResumeAI] Starting queue processor for {QUEUE_TABLE}")

    while True:
        try:
            # Fetch next pending task from queue table
            def _read_message(*args: Any, **kwargs: Any) -> Any:
                return supabase_client.table(QUEUE_TABLE).select(
                    "*"
                ).eq("status", "pending").order(
                    "created_at", desc=False
                ).limit(1).execute()

            result = await asyncio.to_thread(_read_message)

            if not result.data or len(result.data) == 0:
                # No pending tasks, wait before retrying
                await asyncio.sleep(2)
                continue

            task = result.data[0]
            task_id = task.get("id")
            resume_id = task.get("resume_id")
            user_id = task.get("user_id")
            file_path = task.get("file_path")

            logger.info(f"[ResumeAI] Processing queue task {task_id} for resume {resume_id}")

            try:
                # Optimistic claim: only succeeds if status is still 'pending'
                def _mark_processing(*args: Any, **kwargs: Any) -> Any:
                    return supabase_client.table(QUEUE_TABLE).update({
                        "status": "processing"
                    }).eq("id", task_id).eq("status", "pending").execute()

                claimed = await asyncio.to_thread(_mark_processing)
                if not claimed.data:
                    # Another worker already claimed this task
                    logger.info(f"[ResumeAI] Task {task_id} already claimed by another worker, skipping")
                    continue

                # Run the analysis via microservice
                await _run_resume_analysis_with_retry(
                    resume_id, user_id, file_path, supabase_client
                )

                # Mark as completed and delete
                def _mark_completed(*args: Any, **kwargs: Any) -> Any:
                    return supabase_client.table(QUEUE_TABLE).delete().eq(
                        "id", task_id
                    ).execute()

                await asyncio.to_thread(_mark_completed)
                logger.info(f"[ResumeAI] Successfully processed and removed queue task {task_id} for resume {resume_id}")

            except Exception as e:
                logger.error(f"[ResumeAI] Error processing queue task {task_id} for {resume_id}: {e}")
                # Mark as failed
                try:
                    def _mark_failed(*args: Any, **kwargs: Any) -> Any:
                        return supabase_client.table(QUEUE_TABLE).update({
                            "status": "failed",
                            "error": str(e)[:500]
                        }).eq("id", task_id).execute()

                    await asyncio.to_thread(_mark_failed)
                except Exception as update_e:
                    logger.error(f"[ResumeAI] Could not mark task as failed: {update_e}")

        except Exception as e:
            logger.error(f"[ResumeAI] Queue processor error: {e}")
            await asyncio.sleep(2)  # Wait before retrying
