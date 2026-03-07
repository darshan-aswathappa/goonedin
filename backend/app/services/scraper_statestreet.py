import asyncio
import httpx
import logging
from datetime import datetime, timezone, timedelta
from app.core.config import get_settings
from app.core.redis_config import get_blocked_companies, get_title_filter_keywords
from app.models.job import JobCreate

settings = get_settings()
logger = logging.getLogger("StateStreetScraper")

STATESTREET_API_URL = "https://careers.statestreet.com/widgets"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en-IN;q=0.9,en-UM;q=0.8,en;q=0.7",
    "Content-Type": "application/json",
    "Origin": "https://careers.statestreet.com",
    "Referer": "https://careers.statestreet.com/global/en/search-results?m=3",
    "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
}

DEFAULT_PAYLOAD = {
    "lang": "en_global",
    "deviceType": "desktop",
    "country": "global",
    "pageName": "search-results",
    "ddoKey": "eagerLoadRefineSearch",
    "sortBy": "Most recent",
    "subsearch": "",
    "from": 0,
    "jobs": True,
    "counts": True,
    "all_fields": ["category", "country", "state", "city", "positionType", "phLocSlider"],
    "size": 20,
    "clearAll": False,
    "jdsource": "facets",
    "isSliderEnable": True,
    "pageId": "page13",
    "siteType": "external",
    "keywords": "",
    "global": True,
    "selected_fields": {
        "country": ["United States of America"],
        "positionType": ["Full time"],
        "state": ["Massachusetts", "New Jersey", "New York"],
        "category": [
            "Financial Software and Product Development",
            "Information Technology",
            "Internships and Development Programs",
        ],
    },
    "sort": {"order": "desc", "field": "postedDate"},
    "locationData": {"sliderRadius": 100, "aboveMaxRadius": True, "LocationUnit": "miles"},
    "s": "1",
}


def is_posted_recently(date_created: str | None, minutes: int = 5) -> bool:
    """Check if the job was posted within the last N minutes based on dateCreated."""
    if not date_created:
        return False
    try:
        posted_dt = datetime.fromisoformat(date_created.replace("+0000", "+00:00"))
        now = datetime.now(timezone.utc)
        return (now - posted_dt) <= timedelta(minutes=minutes)
    except Exception as e:
        logger.warning(f"Failed to parse dateCreated '{date_created}': {e}")
        return False


async def fetch_statestreet_jobs(redis_client) -> dict:
    """
    Fetches jobs from State Street career page.
    Only returns jobs posted in the past 5 minutes.
    Returns dict with keys: jobs, retries, failed, recent_jobs.
    """
    logger.info("Fetching State Street jobs")

    max_retries = 3
    retries_used = 0

    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = None

            for attempt in range(1, max_retries + 1):
                try:
                    response = await client.post(
                        STATESTREET_API_URL,
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
                    f"State Street API failed with status {response.status_code if response else 'N/A'}: {error_body}"
                )
                return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}

            try:
                data = response.json()
            except Exception as json_err:
                logger.error(f"Failed to parse JSON response: {json_err}")
                return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}

            job_postings = data.get("refineSearch", {}).get("data", {}).get("jobs", [])
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

                    date_created = job.get("dateCreated", "")
                    if not is_posted_recently(date_created, minutes=5):
                        continue

                    req_id = job.get("reqId", "")
                    job_id = job.get("jobId", req_id)
                    if not job_id:
                        continue

                    apply_url = job.get("applyUrl", "")
                    if not apply_url:
                        continue

                    city_state = job.get("cityState", "")
                    country = job.get("country", "")
                    location = f"{city_state}, {country}" if city_state else country

                    if any(
                        blocked.lower() in "state street".lower()
                        for blocked in blocked_companies
                    ):
                        logger.debug("Skipping job from blocked company: State Street")
                        continue

                    posted_dt = None
                    try:
                        posted_dt = datetime.fromisoformat(
                            date_created.replace("+0000", "+00:00")
                        )
                    except Exception:
                        posted_dt = datetime.now(timezone.utc)

                    job_create = JobCreate(
                        title=title,
                        company="State Street",
                        location=location,
                        url=apply_url,
                        source="StateStreet",
                        external_id=str(job_id),
                        posted_at=posted_dt,
                    )

                    parsed_jobs.append(job_create)
                    recent_jobs.append(job_create)
                    logger.info(f"State Street job found (recent): {title}")

                except Exception as parse_err:
                    logger.warning(f"Failed to parse job: {parse_err}")
                    continue

            logger.info(
                f"State Street: {len(parsed_jobs)} jobs parsed (posted < 5 min)"
            )
            return {
                "jobs": parsed_jobs,
                "retries": retries_used,
                "failed": False,
                "recent_jobs": recent_jobs,
            }

    except Exception as e:
        logger.error(f"State Street scraping failed: {type(e).__name__}: {e}")
        return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}
