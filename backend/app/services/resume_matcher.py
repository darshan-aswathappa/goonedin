"""
Pure-Python resume-to-job matching service.
Zero external API calls — keyword overlap scoring only.
"""

import asyncio
import json
import logging
import re
from typing import Any, Optional

logger = logging.getLogger("ResumeMatcher")

# Canonical aliases: normalise variant spellings to a single token
_ALIASES: dict[str, str] = {
    "python3": "python",
    "node.js": "nodejs",
    "node js": "nodejs",
    "c++": "cpp",
    "c#": "csharp",
    "typescript": "ts",
    "javascript": "js",
    "react.js": "react",
    "vue.js": "vue",
    "next.js": "nextjs",
    "nuxt.js": "nuxtjs",
    "express.js": "express",
    "tensorflow": "tf",
    "pytorch": "torch",
    "scikit-learn": "sklearn",
    "scikit learn": "sklearn",
    "machine learning": "ml",
    "deep learning": "dl",
    "natural language processing": "nlp",
    "large language model": "llm",
    "large language models": "llm",
    "kubernetes": "k8s",
    "amazon web services": "aws",
    "google cloud platform": "gcp",
    "google cloud": "gcp",
    "microsoft azure": "azure",
    "ci/cd": "cicd",
    "restful": "rest",
    "rest api": "rest",
    "graphql": "gql",
    "postgresql": "postgres",
    "mongodb": "mongo",
    "docker": "docker",
}


def _normalize(token: str) -> str:
    """Lowercase, strip punctuation, apply canonical aliases."""
    t = token.lower().strip()
    # Strip trailing/leading punctuation but keep internal hyphens
    t = re.sub(r"[^\w\s\-\+\#]", "", t).strip()
    t = re.sub(r"\s+", " ", t)
    return _ALIASES.get(t, t)


def _fuzzy_match(resume_tokens: list[str], job_token: str) -> bool:
    """
    Returns True if job_token appears in any resume_token via containment.
    Handles 'Python 3' (resume) vs 'Python' (job) and vice versa.
    """
    jt = _normalize(job_token)
    if not jt:
        return False
    for rt in resume_tokens:
        if jt in rt or rt in jt:
            return True
    return False


def compute_match(
    resume_skills: list[str],
    resume_keywords: list[str],
    must_have: list[str],
    good_to_have: list[str],
) -> Optional[dict]:
    """
    Score a single resume against job requirements.

    Score = (matched_must + matched_nice * 0.5) / (total_must + total_nice * 0.5)
    Zero-must penalty: if matched_must == 0, multiply by 0.3.

    Returns None if there are no job requirements to match against.
    """
    if not must_have and not good_to_have:
        return None

    # Build normalised resume token set
    all_resume_tokens = [
        _normalize(s) for s in (resume_skills + resume_keywords) if s
    ]
    all_resume_tokens = [t for t in all_resume_tokens if t]

    # Must-have matching
    matched_must: list[str] = []
    missing_must: list[str] = []
    for kw in must_have:
        if _fuzzy_match(all_resume_tokens, kw):
            matched_must.append(kw)
        else:
            missing_must.append(kw)

    # Good-to-have matching
    matched_nice: list[str] = []
    for kw in good_to_have:
        if _fuzzy_match(all_resume_tokens, kw):
            matched_nice.append(kw)

    total_must = len(must_have)
    total_nice = len(good_to_have)
    denominator = total_must + total_nice * 0.5
    if denominator == 0:
        return None

    raw_score = (len(matched_must) + len(matched_nice) * 0.5) / denominator

    # Zero-must penalty
    if len(matched_must) == 0:
        raw_score *= 0.3

    return {
        "score": round(raw_score, 4),
        "matched_must_have": matched_must,
        "missing_must_have": missing_must,
        "matched_good_to_have": matched_nice,
    }


async def get_best_resume_match(
    supabase: Any, user_id: str, job_analysis: dict
) -> Optional[dict]:
    """
    Query user's completed resumes, score each against job_analysis,
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
