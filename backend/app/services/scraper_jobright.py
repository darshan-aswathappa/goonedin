import re
import logging
from datetime import datetime, timezone, timedelta
from app.core.config import get_settings
from app.core.redis_config import get_blocked_companies, get_title_filter_keywords
from app.models.job import JobCreate
from app.services.jobright_auth import fetch_jobright_api_via_playwright

settings = get_settings()
logger = logging.getLogger("JobrightScraper")

JOBRIGHT_API_URL = "https://jobright.ai/swan/recommend/list/jobs"
JOBRIGHT_JOB_COUNT = 50  # Fetch more jobs to avoid missing any in high-volume periods


def parse_jobright_date(date_str: str) -> datetime | None:
    """
    Parses jobright date strings into timezone-aware datetime.
    Format: "2026-02-18 19:02:36" or relative times like "4 hours ago"
    """
    if not date_str:
        return None

    now = datetime.now(timezone.utc)

    if " ago" in date_str.lower():
        text = date_str.lower()
        
        m = re.search(r"(\d+)\s*min", text)
        if m:
            return now - timedelta(minutes=int(m.group(1)))

        m = re.search(r"(\d+)\s*hour", text)
        if m:
            return now - timedelta(hours=int(m.group(1)))

        m = re.search(r"(\d+)\s*day", text)
        if m:
            return now - timedelta(days=int(m.group(1)))
        
        return now

    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc)
    except ValueError:
        pass

    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except ValueError:
        pass

    return None


async def fetch_jobright_jobs(redis_client, keywords: str = None, location: str = None) -> dict:
    """
    Fetches jobs from Jobright.ai API using Playwright (fresh login each time).
    No cookie caching - eliminates session expiry issues entirely.
    Returns dict with keys: jobs, retries, failed.
    """
    logger.info("Fetching Jobright recommended jobs via Playwright")

    try:
        data = await fetch_jobright_api_via_playwright(JOBRIGHT_API_URL, count=JOBRIGHT_JOB_COUNT)
        
        if not data:
            logger.error("Jobright Playwright fetch returned no data")
            return {"jobs": [], "retries": 0, "failed": True}

        if not data.get("success"):
            logger.error(f"Jobright API returned error: {data.get('errorMsg')}")
            return {"jobs": [], "retries": 0, "failed": True}

        result = data.get("result", {})
        job_list = result.get("jobList", [])

        parsed_jobs = []

        MIN_DISPLAY_SCORE = 85.0
        skipped_low_score = 0

        # Get config from Redis
        title_filter_keywords = await get_title_filter_keywords(redis_client)
        blocked_companies = await get_blocked_companies(redis_client)

        for item in job_list:
            try:
                display_score = item.get("displayScore", 0)
                if display_score < MIN_DISPLAY_SCORE:
                    skipped_low_score += 1
                    continue

                job = item.get("jobResult", {})
                company = item.get("companyResult", {})

                title = job.get("jobTitle") or job.get("jobNlpTitle")
                if not title:
                    continue

                if any(kw in title.lower() for kw in title_filter_keywords):
                    logger.debug(f"Skipping job with filtered title: {title}")
                    continue

                company_name = company.get("companyName") or "Unknown"

                if any(blocked.lower() in company_name.lower() for blocked in blocked_companies):
                    logger.debug(f"Skipping job from blocked company: {company_name}")
                    continue

                job_location = job.get("jobLocation") or "Unknown"
                work_model = job.get("workModel", "")
                if work_model:
                    job_location = f"{job_location} ({work_model})"

                job_url = job.get("originalUrl") or job.get("applyLink")
                if not job_url:
                    job_id = job.get("jobId")
                    if job_id:
                        job_url = f"https://jobright.ai/jobs/{job_id}"
                    else:
                        continue

                external_id = job.get("jobId", "")
                if not external_id:
                    continue

                posted_str = job.get("publishTime") or job.get("publishTimeDesc")
                posted_at = parse_jobright_date(str(posted_str)) if posted_str else None

                parsed_jobs.append(JobCreate(
                    title=title,
                    company=company_name,
                    location=job_location,
                    url=job_url,
                    source="Jobright",
                    external_id=external_id,
                    posted_at=posted_at,
                ))

            except Exception as parse_err:
                logger.warning(f"Failed to parse job: {parse_err}")
                continue

        logger.info(f"Jobright: {len(parsed_jobs)} jobs parsed (skipped {skipped_low_score} with score < {MIN_DISPLAY_SCORE})")
        return {"jobs": parsed_jobs, "retries": 0, "failed": False}

    except Exception as e:
        logger.error(f"Jobright scraping failed: {type(e).__name__}: {e}")
        return {"jobs": [], "retries": 0, "failed": True}
