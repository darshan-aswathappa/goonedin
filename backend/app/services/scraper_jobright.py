import re
import asyncio
import httpx
import logging
from datetime import datetime, timezone, timedelta
from app.core.config import get_settings
from app.models.job import JobCreate
from app.services.jobright_auth import get_cookie_header, invalidate_cookies

settings = get_settings()
logger = logging.getLogger("JobrightScraper")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://jobright.ai/jobs/recommend",
    "Origin": "https://jobright.ai",
    "x-client-type": "web",
    "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
}

JOBRIGHT_API_URL = "https://jobright.ai/swan/recommend/list/jobs"


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


async def fetch_jobright_jobs(keywords: str = None, location: str = None) -> dict:
    """
    Fetches jobs from Jobright.ai API using authenticated cookies.
    Returns dict with keys: jobs, retries, failed.
    Note: Don't use proxy for Jobright since cookies are tied to browser session IP.
    """
    logger.info(f"Fetching Jobright recommended jobs")

    max_retries = 3
    retries_used = 0

    try:
        cookie_header = await get_cookie_header()
        if not cookie_header:
            logger.error("Failed to get Jobright cookies - skipping this cycle")
            return {"jobs": [], "retries": 0, "failed": True}

        logger.debug(f"Cookie header obtained, length: {len(cookie_header)}")
        
        cookies_dict = {}
        for part in cookie_header.split("; "):
            if "=" in part:
                key, val = part.split("=", 1)
                cookies_dict[key] = val

        url = f"{JOBRIGHT_API_URL}?refresh=true&sortCondition=1&position=0&count=10"

        async with httpx.AsyncClient(follow_redirects=True, cookies=cookies_dict) as client:
            response = None

            for attempt in range(1, max_retries + 1):
                try:
                    response = await client.get(url, headers=HEADERS, timeout=30.0)

                    if response.status_code == 401 or response.status_code == 403:
                        logger.warning(f"Auth failed (HTTP {response.status_code}), invalidating cookies")
                        await invalidate_cookies()
                        return {"jobs": [], "retries": attempt, "failed": True}

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
                logger.error(f"Jobright API failed with status {response.status_code if response else 'N/A'}: {error_body}")
                return {"jobs": [], "retries": retries_used, "failed": True}

            try:
                data = response.json()
            except Exception as json_err:
                logger.error(f"Failed to parse JSON response: {json_err}")
                return {"jobs": [], "retries": retries_used, "failed": True}

            if not data.get("success"):
                logger.error(f"Jobright API returned error: {data.get('errorMsg')}")
                return {"jobs": [], "retries": retries_used, "failed": True}

            result = data.get("result", {})
            job_list = result.get("jobList", [])

            parsed_jobs = []

            MIN_DISPLAY_SCORE = 92.0
            skipped_low_score = 0

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

                    posted_str = job.get("publishTime") or job.get("publishTimeDesc")
                    posted_at = parse_jobright_date(str(posted_str)) if posted_str else None

                    parsed_jobs.append(JobCreate(
                        title=title,
                        company=company_name,
                        location=location,
                        url=job_url,
                        source="Jobright",
                        external_id=external_id,
                        posted_at=posted_at,
                    ))

                except Exception as parse_err:
                    logger.warning(f"Failed to parse job: {parse_err}")
                    continue

            logger.info(f"Jobright: {len(parsed_jobs)} jobs parsed (skipped {skipped_low_score} with score < {MIN_DISPLAY_SCORE})")
            return {"jobs": parsed_jobs, "retries": retries_used, "failed": False}

    except Exception as e:
        logger.error(f"Jobright scraping failed: {type(e).__name__}: {e}")
        return {"jobs": [], "retries": retries_used, "failed": True}
