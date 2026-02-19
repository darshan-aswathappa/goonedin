import re
import asyncio
import httpx
import logging
from datetime import datetime, timezone, timedelta
from app.core.config import get_settings
from app.models.job import JobCreate

settings = get_settings()
logger = logging.getLogger("JobrightMiniSites")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en-IN;q=0.9,en-UM;q=0.8,en;q=0.7",
    "Content-Type": "application/json",
    "Referer": "https://jobright.ai/minisites-jobs/newgrad/us/swe?embed=true",
    "Origin": "https://jobright.ai",
    "x-client-type": "web",
    "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
}

MINISITES_API_URL = "https://jobright.ai/swan/mini-sites/list"


def parse_posted_at(posted_at_value) -> datetime | None:
    """
    Parses the postedAt field from mini-sites API.
    Could be a timestamp (ms), ISO string, or relative time.
    """
    if not posted_at_value:
        return None

    now = datetime.now(timezone.utc)

    if isinstance(posted_at_value, (int, float)):
        try:
            if posted_at_value > 1e12:
                return datetime.fromtimestamp(posted_at_value / 1000, tz=timezone.utc)
            else:
                return datetime.fromtimestamp(posted_at_value, tz=timezone.utc)
        except (ValueError, OSError):
            return None

    if isinstance(posted_at_value, str):
        text = posted_at_value.lower()

        if " ago" in text:
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
            dt = datetime.strptime(posted_at_value, "%Y-%m-%d %H:%M:%S")
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

        try:
            return datetime.fromisoformat(posted_at_value.replace("Z", "+00:00"))
        except ValueError:
            pass

    return None


def is_posted_within_minutes(posted_at: datetime | None, minutes: int = 5) -> bool:
    """Check if a job was posted within the specified number of minutes."""
    if not posted_at:
        return False
    now = datetime.now(timezone.utc)
    if posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    return (now - posted_at) <= timedelta(minutes=minutes)


async def fetch_jobright_minisites_jobs() -> dict:
    """
    Fetches jobs from Jobright.ai Mini-Sites API (public, no auth required).
    Returns new grad SWE jobs with H1B sponsorship.
    Returns dict with keys: jobs, retries, failed, recent_jobs.
    """
    logger.info("Fetching Jobright mini-sites (newgrad SWE) jobs")

    max_retries = 3
    retries_used = 0

    try:
        url = f"{MINISITES_API_URL}?position=0&count=50"

        payload = {
            "category": "newgrad:us:swe",
            "h1bSponsored": ["Yes", "Not Sure"],
            "isNewGrad": True
        }

        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = None

            for attempt in range(1, max_retries + 1):
                try:
                    response = await client.post(
                        url,
                        headers=HEADERS,
                        json=payload,
                        timeout=30.0
                    )

                    if response.status_code == 200:
                        break

                except (httpx.ConnectError, httpx.ConnectTimeout, httpx.RemoteProtocolError) as retry_err:
                    retries_used = attempt
                    if attempt < max_retries:
                        logger.warning(f"Retry {attempt}/{max_retries}: {type(retry_err).__name__}")
                        await asyncio.sleep(1 * attempt)
                    else:
                        raise

            if not response or response.status_code != 200:
                error_body = response.text[:500] if response else "N/A"
                logger.error(f"Mini-sites API failed with status {response.status_code if response else 'N/A'}: {error_body}")
                return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}

            try:
                data = response.json()
            except Exception as json_err:
                logger.error(f"Failed to parse JSON response: {json_err}")
                return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}

            if not data.get("success"):
                logger.error(f"Mini-sites API returned error: {data.get('errorMsg')}")
                return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}

            result = data.get("result", {})
            job_list = result.get("jobList", [])

            parsed_jobs = []
            recent_jobs = []

            for item in job_list:
                try:
                    job = item.get("jobResult", {})
                    company = item.get("companyResult", {})

                    title = job.get("jobTitle") or job.get("jobNlpTitle")
                    if not title:
                        continue

                    company_name = company.get("companyName") or "Unknown"

                    if any(blocked.lower() in company_name.lower() for blocked in settings.BLOCKED_COMPANIES):
                        logger.debug(f"Skipping job from blocked company: {company_name}")
                        continue

                    location = job.get("jobLocation") or "Unknown"
                    work_model = job.get("workModel", "")
                    if work_model:
                        location = f"{location} ({work_model})"

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

                    posted_at_raw = job.get("postedAt") or job.get("publishTime") or job.get("publishTimeDesc")
                    posted_at = parse_posted_at(posted_at_raw)

                    job_create = JobCreate(
                        title=title,
                        company=company_name,
                        location=location,
                        url=job_url,
                        source="JobrightMiniSites",
                        external_id=external_id,
                        posted_at=posted_at,
                    )

                    parsed_jobs.append(job_create)

                    if is_posted_within_minutes(posted_at, minutes=5):
                        recent_jobs.append(job_create)
                        logger.info(f"Recent job found (< 5 min): {title} @ {company_name}")

                except Exception as parse_err:
                    logger.warning(f"Failed to parse job: {parse_err}")
                    continue

            logger.info(f"Mini-sites: {len(parsed_jobs)} jobs parsed, {len(recent_jobs)} posted in last 5 min")
            return {
                "jobs": parsed_jobs,
                "retries": retries_used,
                "failed": False,
                "recent_jobs": recent_jobs
            }

    except Exception as e:
        logger.error(f"Mini-sites scraping failed: {type(e).__name__}: {e}")
        return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}
