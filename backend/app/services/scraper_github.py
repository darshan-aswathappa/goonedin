import asyncio
import httpx
import logging
from datetime import datetime, timezone, timedelta
from app.core.redis_config import get_blocked_companies, get_title_filter_keywords
from app.models.job import JobCreate

GITHUB_LISTINGS_URL = "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/refs/heads/dev/.github/scripts/listings.json"
RECENT_MINUTES = 30

logger = logging.getLogger("GitHubScraper")


def is_posted_within_30_min(date_posted: int | None) -> bool:
    """Check if the job was posted within the last 30 minutes (Unix timestamp)."""
    if not date_posted:
        return False
    try:
        posted_dt = datetime.fromtimestamp(date_posted, tz=timezone.utc)
        return (datetime.now(timezone.utc) - posted_dt) <= timedelta(minutes=RECENT_MINUTES)
    except Exception as e:
        logger.warning(f"Failed to parse date_posted '{date_posted}': {e}")
        return False


async def fetch_github_jobs(redis_client) -> dict:
    """
    Fetches new grad job listings from SimplifyJobs GitHub repository.
    Only returns active jobs posted in the last 30 minutes.
    Returns dict with keys: jobs, recent_jobs, retries, failed.
    """
    logger.info("Fetching GitHub (SimplifyJobs) new grad listings")

    max_retries = 3
    retries_used = 0

    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = None

            for attempt in range(1, max_retries + 1):
                try:
                    response = await client.get(
                        GITHUB_LISTINGS_URL,
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
                status = response.status_code if response else "N/A"
                body = response.text[:500] if response else "N/A"
                logger.error(f"GitHub listings request failed with status {status}: {body}")
                return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}

            try:
                listings = response.json()
            except Exception as json_err:
                logger.error(f"Failed to parse JSON response: {json_err}")
                return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}

            parsed_jobs = []
            recent_jobs = []

            title_filter_keywords = await get_title_filter_keywords(redis_client)
            blocked_companies = await get_blocked_companies(redis_client)

            for listing in listings:
                try:
                    if not listing.get("active", False):
                        continue

                    if not listing.get("is_visible", False):
                        continue

                    if listing.get("category", "").strip().lower() != "software":
                        continue

                    title = listing.get("title", "").strip()
                    if not title:
                        continue

                    if any(kw in title.lower() for kw in title_filter_keywords):
                        logger.debug(f"Skipping job with filtered title: {title}")
                        continue

                    date_posted = listing.get("date_posted")
                    if not is_posted_within_30_min(date_posted):
                        continue

                    external_id = listing.get("id", "")
                    if not external_id:
                        continue

                    url = listing.get("url", "")
                    if not url:
                        continue

                    company_name = listing.get("company_name", "").strip()
                    if not company_name:
                        continue

                    if any(
                        blocked.lower() in company_name.lower()
                        for blocked in blocked_companies
                    ):
                        logger.debug(f"Skipping job from blocked company: {company_name}")
                        continue

                    locations = listing.get("locations", [])
                    location = locations[0] if locations else "United States"

                    posted_at = datetime.fromtimestamp(date_posted, tz=timezone.utc)

                    job_create = JobCreate(
                        title=title,
                        company=company_name,
                        location=location,
                        url=url,
                        source="GitHub",
                        external_id=str(external_id),
                        posted_at=posted_at,
                    )

                    parsed_jobs.append(job_create)
                    recent_jobs.append(job_create)
                    logger.info(f"GitHub job found (recent): {title} @ {company_name}")

                except Exception as parse_err:
                    logger.warning(f"Failed to parse listing: {parse_err}")
                    continue

            logger.info(
                f"GitHub: {len(parsed_jobs)} jobs parsed (active, posted < 30 min)"
            )
            return {
                "jobs": parsed_jobs,
                "retries": retries_used,
                "failed": False,
                "recent_jobs": recent_jobs,
            }

    except Exception as e:
        logger.error(f"GitHub scraping failed: {type(e).__name__}: {e}")
        return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}
