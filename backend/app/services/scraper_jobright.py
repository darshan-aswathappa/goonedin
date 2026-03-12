"""
Scraper for Jobright.ai personalized job listings via curl_cffi.

Uses JobrightSessionManager for automatic authentication — no more
manually pasting session cookies.

Also extracts pre-built analysis (qualifications, skills, summary)
directly from the Jobright API response — no DeepSeek needed.
"""

import logging
from typing import Dict, Any, List, Optional, Tuple
import time
from datetime import datetime, timezone

from curl_cffi.requests import AsyncSession

from app.core.config import get_settings
from app.models.job import JobCreate
from app.services.jobright_session import session_manager

logger = logging.getLogger("ScraperJobright")
settings = get_settings()

_last_jobright_fetch = 0

JOBS_URL = (
    "https://jobright.ai/swan/recommend/list/jobs"
    "?refresh=true&sortCondition=1&position=0&count={limit}&syncRerank=false"
)

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "priority": "u=1, i",
    "referer": "https://jobright.ai/home",
    "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/130.0.0.0 Safari/537.36"
    ),
}


def _parse_job(item: dict, now: datetime, max_age_hours: Optional[float]) -> Optional[Tuple[JobCreate, dict]]:
    """
    Parse a single Jobright API item into a (JobCreate, analysis_dict) tuple,
    or None if filtered out.

    The API wraps each job in {"jobResult": {...}, "displayScore": ..., ...}.
    The actual job fields live inside `jobResult`.

    The analysis dict matches the DeepSeek schema so the frontend can
    display the same Hard Requirements / Secondary Skills / Credentials modal.
    """
    jr = item.get("jobResult", item)  # unwrap, or use item directly as fallback

    job_id = jr.get("jobId")
    if not job_id:
        return None

    title = jr.get("jobTitle") or jr.get("jobNlpTitle") or jr.get("title", "Unknown Title")
    job_url = f"https://jobright.ai/jobs/info/{job_id}"

    # Company name lives in a sibling "companyResult" object
    cr = item.get("companyResult", {})
    company = cr.get("companyName") or jr.get("companyName", "Unknown Company")

    location = jr.get("jobLocation") or jr.get("workAddress", "Unknown Location")

    # Parse posted date — can be ISO string or epoch millis
    publish_time = jr.get("publishTime")
    posted_dt = now
    if publish_time:
        try:
            if isinstance(publish_time, str):
                # ISO-style: "2026-03-09 20:07:37"
                posted_dt = datetime.fromisoformat(publish_time).replace(tzinfo=timezone.utc)
            else:
                pts = int(publish_time)
                if pts > 2e10:
                    pts = pts / 1000.0
                posted_dt = datetime.fromtimestamp(pts, tz=timezone.utc)
        except Exception:
            pass

    # Age filter
    if max_age_hours is not None:
        job_age_hrs = (now - posted_dt).total_seconds() / 3600.0
        if job_age_hrs > float(max_age_hours):
            return None

    # Salary
    salary = jr.get("salaryDesc") or jr.get("salary")
    if not salary and jr.get("minSalary") and jr.get("maxSalary"):
        unit = jr.get("salaryUnit", "/ yr")
        salary = f"${jr['minSalary']} - ${jr['maxSalary']} {unit}"

    # Visa support — check both old boolean and new tags format
    visa_support = None
    if jr.get("isH1bSponsor") is True:
        visa_support = "H1B Sponsor"
    elif "H1B Sponsor Likely" in (jr.get("recommendationTags") or []):
        visa_support = "H1B Sponsor Likely"

    # Work model — check string field first, then numeric
    work_model_str = jr.get("workModel", "")
    if work_model_str:
        work_model = work_model_str  # "Remote", "Hybrid", "Onsite"
    else:
        work_model = "Onsite"
        if jr.get("workplaceType") == 2 or jr.get("isRemote") is True:
            work_model = "Remote"
        elif jr.get("workplaceType") == 3:
            work_model = "Hybrid"

    # --- Build analysis from API data (same schema as DeepSeek) ---
    quals = jr.get("qualifications", {})
    must_have = quals.get("mustHave", []) or []
    preferred = quals.get("preferredHave", []) or []

    # Build minimum_qualifications from detailQualifications
    detail_quals = jr.get("detailQualifications", {})
    min_quals: List[str] = []
    must_detail = detail_quals.get("mustHave", {})
    for yoe in must_detail.get("yoe", []):
        if isinstance(yoe, dict) and yoe.get("skill"):
            min_quals.append(yoe["skill"])
        elif isinstance(yoe, str) and yoe:
            min_quals.append(yoe)
    for edu in must_detail.get("education", []):
        if isinstance(edu, dict) and edu.get("skill"):
            min_quals.append(edu["skill"])
        elif isinstance(edu, str) and edu:
            min_quals.append(edu)
    # If no structured detail, extract education-like items from mustHave
    if not min_quals:
        for item_text in must_have:
            lower = item_text.lower()
            if any(kw in lower for kw in ["degree", "bachelor", "master", "phd",
                                           "b.s", "m.s", "b.sc", "m.sc",
                                           "years of experience", "year experience",
                                           "certification", "clearance"]):
                min_quals.append(item_text)

    summary = jr.get("jobSummary") or ""

    analysis = {
        "must_have_keywords": must_have,
        "good_to_have_keywords": preferred,
        "minimum_qualifications": min_quals,
        "summary": summary,
    }

    job = JobCreate(
        external_id=str(job_id),
        title=title,
        company=company,
        location=location,
        url=job_url,
        source="Jobright",
        posted_at=posted_dt.isoformat(),
        salary=salary,
        visa=visa_support,
        work_model=work_model,
        visible=False,
        is_notified=False,
    )

    return job, analysis


async def _fetch_with_session(
    session_id: str, limit: int, max_age_hours: Optional[float]
) -> Dict[str, Any]:
    """Make the actual API call using a given session ID."""
    proxy = settings.PROXY_URL
    proxies = {"http": proxy, "https": proxy} if proxy else None

    headers = {**HEADERS, "cookie": f"SESSION_ID={session_id}"}
    url = JOBS_URL.format(limit=limit)

    async with AsyncSession(impersonate="chrome", proxies=proxies, verify=False) as s:
        resp = await s.get(url, headers=headers, timeout=15)

        if resp.status_code == 401:
            return {"failed": True, "jobs": [], "auth_error": True}

        if resp.status_code != 200:
            logger.error(f"[Jobright] Fetch failed: HTTP {resp.status_code}")
            return {"failed": True, "jobs": []}

        data = resp.json()

        # New format: {"success": bool, "errorCode": int, "result": {...}}
        # Old format: {"code": 20000, "data": {"list": [...]}}
        is_success = data.get("success") is True or data.get("code") == 20000

        if not is_success:
            error_code = data.get("errorCode") or data.get("code")
            msg = data.get("errorMsg") or data.get("message", "unknown")
            # Auth-related error codes → trigger session refresh
            if error_code in (40100, 40101, 41001):
                logger.warning(f"[Jobright] Auth error from API: {msg}")
                return {"failed": True, "jobs": [], "auth_error": True}
            logger.error(f"[Jobright] API logic error (code={error_code}): {msg}")
            return {"failed": True, "jobs": []}

        # Extract job list — handle both response formats
        job_items = (
            data.get("result", {}).get("jobList", [])  # new format
            or data.get("data", {}).get("list", [])      # old format fallback
        )
        logger.info(f"[Jobright] Found {len(job_items)} items in payload.")

        now = datetime.now(timezone.utc)
        new_jobs: List[JobCreate] = []
        analyses: Dict[str, dict] = {}  # external_id -> analysis dict
        for item in job_items:
            result = _parse_job(item, now, max_age_hours)
            if result:
                job, analysis = result
                new_jobs.append(job)
                analyses[job.external_id] = analysis

        return {"failed": False, "jobs": new_jobs, "analyses": analyses}


async def fetch_jobright_jobs(
    limit: int = 15,
    max_age_hours: Optional[float] = 2.0,
) -> Dict[str, Any]:
    """
    Fetch personalized jobs from Jobright.ai.

    Uses auto-login for SESSION_ID management. If the session is invalid,
    automatically refreshes and retries once.
    """
    global _last_jobright_fetch
    now_ts = time.time()

    # 10 minute cooldown
    if now_ts - _last_jobright_fetch < 600:
        logger.debug("[Jobright] Skipping fetch, on 10m cooldown.")
        return {"failed": False, "jobs": []}

    _last_jobright_fetch = now_ts

    try:
        # Get session (auto-login if needed)
        session_id = await session_manager.get_session_id()
        logger.info(
            f"[Jobright] Fetching personalized jobs "
            f"(session={session_id[:8]}...)"
        )

        result = await _fetch_with_session(session_id, limit, max_age_hours)

        # If auth error, refresh session and retry once
        if result.get("auth_error"):
            logger.warning("[Jobright] Auth error, refreshing session and retrying...")
            session_id = await session_manager.refresh()
            result = await _fetch_with_session(session_id, limit, max_age_hours)

            if result.get("auth_error"):
                logger.error("[Jobright] Auth error persists after refresh")
                return {"failed": True, "jobs": []}

        return result

    except Exception as e:
        logger.error(f"[Jobright] Scraper error: {e}", exc_info=True)
        return {"failed": True, "jobs": []}
