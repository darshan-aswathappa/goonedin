"""
Resume-to-job matching — backend orchestration only.
Scoring is delegated to the resume microservice.
"""

import asyncio
import json
import logging
from typing import Any, Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger("ResumeMatcher")


async def get_best_resume_match(
    supabase: Any, user_id: str, job_analysis: dict
) -> Optional[dict]:
    """
    Query user's completed resumes, score each against job_analysis via microservice,
    return the best match as a dict or None.
    """
    settings = get_settings()

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

            # Skills and keywords may be stored as JSON strings
            skills_raw = row.get("skills", [])
            keywords_raw = row.get("project_keywords", [])

            if isinstance(skills_raw, str):
                try:
                    skills_raw = json.loads(skills_raw)
                except (json.JSONDecodeError, TypeError):
                    skills_raw = []
            if isinstance(keywords_raw, str):
                try:
                    keywords_raw = json.loads(keywords_raw)
                except (json.JSONDecodeError, TypeError):
                    keywords_raw = []

            skills: list[str] = skills_raw if isinstance(skills_raw, list) else []
            keywords: list[str] = keywords_raw if isinstance(keywords_raw, list) else []

            # Call resume microservice for matching
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{settings.RESUME_SERVICE_URL}/match",
                    json={
                        "resume_skills": skills,
                        "resume_project_keywords": keywords,
                        "must_have_keywords": must_have,
                        "good_to_have_keywords": good_to_have,
                    },
                )
                resp.raise_for_status()
                result = resp.json().get("match")

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
