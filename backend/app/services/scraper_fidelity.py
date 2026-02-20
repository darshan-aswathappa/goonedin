import asyncio
import httpx
import logging
from datetime import datetime, timezone
from app.core.config import get_settings
from app.core.redis_config import get_blocked_companies, get_title_filter_keywords
from app.models.job import JobCreate

settings = get_settings()
logger = logging.getLogger("FidelityScraper")

FIDELITY_API_URL = "https://wd1.myworkdaysite.com/wday/cxs/fmr/FidelityCareers/jobs"
FIDELITY_BASE_URL = "https://wd1.myworkdaysite.com/en-US/recruiting/fmr/FidelityCareers"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US",
    "Content-Type": "application/json",
    "Origin": "https://wd1.myworkdaysite.com",
    "Referer": "https://wd1.myworkdaysite.com/en-US/recruiting/fmr/FidelityCareers",
    "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
}

DEFAULT_PAYLOAD = {
    "appliedFacets": {
        "locationCountry": ["bc33aa3152ec42d4995f4791a106ed09"],
        "locationRegionStateProvince": [
            "4c2f08af9b834f13bf4c2d41679d222d",
            "9819bf0148e54f89adb255aa7bead635",
            "9b56fe16bdf74b2cbad8b644cdf6015a",
            "9efc91fd842142a0b0bf455e723b65a0",
            "c66d738416b74fb180376cf59cc7ec8f",
            "bffb3e4c9a4a4542bc6bd075a4c26247",
        ],
        "jobFamilyGroup": ["e39fd413f80c0104eb5775256a997b12"],
        "timeType": ["06f28e2f28c601248ec56b994b994d00"],
    },
    "limit": 20,
    "offset": 0,
    "searchText": "",
}


def is_posted_today(posted_on: str | None) -> bool:
    """Check if the job was posted today based on the postedOn field."""
    if not posted_on:
        return False
    return posted_on.lower() == "posted today"


async def fetch_fidelity_jobs(redis_client) -> dict:
    """
    Fetches jobs from Fidelity Investments career page (Workday API).
    Only returns jobs posted today.
    Returns dict with keys: jobs, retries, failed, recent_jobs.
    """
    logger.info("Fetching Fidelity Investments jobs")

    max_retries = 3
    retries_used = 0

    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = None

            for attempt in range(1, max_retries + 1):
                try:
                    response = await client.post(
                        FIDELITY_API_URL,
                        headers=HEADERS,
                        json=DEFAULT_PAYLOAD,
                        timeout=30.0,
                    )

                    if response.status_code == 200:
                        break

                except (
                    httpx.ConnectError,
                    httpx.ConnectTimeout,
                    httpx.RemoteProtocolError,
                ) as retry_err:
                    retries_used = attempt
                    if attempt < max_retries:
                        logger.warning(
                            f"Retry {attempt}/{max_retries}: {type(retry_err).__name__}"
                        )
                        await asyncio.sleep(1 * attempt)
                    else:
                        raise

            if not response or response.status_code != 200:
                error_body = response.text[:500] if response else "N/A"
                logger.error(
                    f"Fidelity API failed with status {response.status_code if response else 'N/A'}: {error_body}"
                )
                return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}

            try:
                data = response.json()
            except Exception as json_err:
                logger.error(f"Failed to parse JSON response: {json_err}")
                return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}

            job_postings = data.get("jobPostings", [])
            parsed_jobs = []
            recent_jobs = []

            # Get config from Redis
            title_filter_keywords = await get_title_filter_keywords(redis_client)
            blocked_companies = await get_blocked_companies(redis_client)

            for job in job_postings:
                try:
                    title = job.get("title")
                    if not title:
                        continue

                    if any(kw in title.lower() for kw in title_filter_keywords):
                        logger.debug(f"Skipping job with filtered title: {title}")
                        continue

                    posted_on = job.get("postedOn", "")
                    if not is_posted_today(posted_on):
                        continue

                    external_path = job.get("externalPath", "")
                    if not external_path:
                        continue

                    bullet_fields = job.get("bulletFields", [])
                    external_id = bullet_fields[0] if bullet_fields else external_path

                    locations_text = job.get("locationsText", "Unknown")
                    job_url = f"{FIDELITY_BASE_URL}{external_path}"

                    if any(
                        blocked.lower() in "fidelity investments".lower()
                        for blocked in blocked_companies
                    ):
                        logger.debug("Skipping job from blocked company: Fidelity Investments")
                        continue

                    job_create = JobCreate(
                        title=title,
                        company="Fidelity Investments",
                        location=locations_text,
                        url=job_url,
                        source="Fidelity",
                        external_id=str(external_id),
                        posted_at=datetime.now(timezone.utc),
                    )

                    parsed_jobs.append(job_create)
                    recent_jobs.append(job_create)
                    logger.info(f"Fidelity job found (Posted Today): {title}")

                except Exception as parse_err:
                    logger.warning(f"Failed to parse job: {parse_err}")
                    continue

            logger.info(
                f"Fidelity: {len(parsed_jobs)} jobs parsed (all posted today)"
            )
            return {
                "jobs": parsed_jobs,
                "retries": retries_used,
                "failed": False,
                "recent_jobs": recent_jobs,
            }

    except Exception as e:
        logger.error(f"Fidelity scraping failed: {type(e).__name__}: {e}")
        return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}
