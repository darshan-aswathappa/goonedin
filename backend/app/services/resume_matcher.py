"""
Resume-to-job matching — backend orchestration only.
Scoring is performed locally via compute_match() — no HTTP round-trips.
"""

import asyncio
import logging
from typing import Any, Optional

from app.services.resume_matcher_core import compute_match

logger = logging.getLogger("ResumeMatcher")


async def get_best_resume_match(
    supabase: Any, user_id: str, job_analysis: dict
) -> Optional[dict]:
    """
    Query user's completed resumes, score each against job_analysis directly,
    return the best match as a dict or None.
    """
    try:
        # Step 1: get user's completed resumes
        resumes_resp = await asyncio.to_thread(
            lambda: supabase.table("user_resumes")
            .select("id, filename")
            .eq("user_id", user_id)
            .eq("analysis_status", "completed")
            .execute()
        )
        resumes = resumes_resp.data or []

        if not resumes:
            logger.info(f"[ResumeMatcher] No completed resumes for user {user_id}")
            return None  # Fast-exit: no resumes

        resume_ids = [r["id"] for r in resumes]
        id_to_filename = {r["id"]: r["filename"] for r in resumes}
        logger.info(f"[ResumeMatcher] Found {len(resumes)} completed resume(s) for user {user_id}: {[r['filename'] for r in resumes]}")

        # Step 2: get resume analysis rows
        analysis_resp = await asyncio.to_thread(
            lambda: supabase.table("resume_analysis")
            .select("resume_id, skills, project_keywords")
            .in_("resume_id", resume_ids)
            .execute()
        )
        analyses = analysis_resp.data or []

        if not analyses:
            logger.info(f"[ResumeMatcher] No resume_analysis rows found for user {user_id} (resume_ids={resume_ids})")
            return None

        # Extract job requirements
        must_have: list[str] = job_analysis.get("must_have_keywords") or []
        good_to_have: list[str] = job_analysis.get("good_to_have_keywords") or []

        best_score = -1.0
        best_result: Optional[dict] = None
        best_resume_id: Optional[str] = None

        for row in analyses:
            resume_id = row["resume_id"]

            skills: list[str] = row.get("skills") or []
            keywords: list[str] = row.get("project_keywords") or []

            # Call compute_match directly — no HTTP round-trip needed.
            # NOTE: compute_match() is a local copy of resume_service/matcher.py.
            # See backend/app/services/resume_matcher_core.py for sync obligations.
            result = compute_match(skills, keywords, must_have, good_to_have)

            if result is None:
                continue

            if result["score"] > best_score:
                best_score = result["score"]
                best_result = result
                best_resume_id = resume_id

        if best_result is None or best_resume_id is None:
            return None

        return {
            "best_resume_id": best_resume_id,
            "best_resume_filename": id_to_filename.get(best_resume_id, "Unknown"),
            "score": best_result["score"],
            "matched_skills": best_result["matched_must_have"],
            "missing_skills": best_result["missing_must_have"],
            "matched_nice_to_have": best_result["matched_good_to_have"],
        }

    except Exception as e:
        logger.error(f"get_best_resume_match error for user {user_id}: {e}")
        raise
