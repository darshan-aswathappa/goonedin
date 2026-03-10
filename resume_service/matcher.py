"""
Pure-Python resume-to-job matching.
Zero external API calls — keyword overlap scoring only.
"""

import re
from typing import Optional

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
    t = re.sub(r"[^\w\s\-\+\#]", "", t).strip()
    t = re.sub(r"\s+", " ", t)
    return _ALIASES.get(t, t)


def _fuzzy_match(resume_tokens: list[str], job_token: str) -> bool:
    """
    Returns True if job_token appears in any resume_token via containment.
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

    all_resume_tokens = [
        _normalize(s) for s in (resume_skills + resume_keywords) if s
    ]
    all_resume_tokens = [t for t in all_resume_tokens if t]

    matched_must: list[str] = []
    missing_must: list[str] = []
    for kw in must_have:
        if _fuzzy_match(all_resume_tokens, kw):
            matched_must.append(kw)
        else:
            missing_must.append(kw)

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

    if len(matched_must) == 0:
        raw_score *= 0.3

    return {
        "score": round(raw_score, 4),
        "matched_must_have": matched_must,
        "missing_must_have": missing_must,
        "matched_good_to_have": matched_nice,
    }
