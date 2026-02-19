import asyncio
import re
import httpx
import logging
from bs4 import BeautifulSoup
from app.core.config import get_settings
from app.models.job import JobCreate

settings = get_settings()
logger = logging.getLogger("MathWorksScraper")

MATHWORKS_BASE_URL = "https://www.mathworks.com"
MATHWORKS_SEARCH_URL = (
    "https://www.mathworks.com/company/jobs/opportunities/search"
    "?sort_origin=user&sort_order=DATE+DESC"
    "&job_type_id%5B%5D=1756&job_type_id%5B%5D=1754"
    "&posting_team_id%5B%5D=5&posting_team_id%5B%5D=12"
    "&posting_team_id%5B%5D=12&posting_team_id%5B%5D=1"
    "&posting_team_id%5B%5D=7&posting_team_id%5B%5D=2"
    "&keywords=&location%5B%5D=US"
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en-IN;q=0.9,en-UM;q=0.8,en;q=0.7",
    "Cache-Control": "max-age=0",
    "Referer": "https://www.mathworks.com/company/jobs/opportunities/search?job_type_id%5B%5D=1756&job_type_id%5B%5D=1754&keywords=&location%5B%5D=US&posting_team_id%5B%5D=5&posting_team_id%5B%5D=12&posting_team_id%5B%5D=12&posting_team_id%5B%5D=1&posting_team_id%5B%5D=7&posting_team_id%5B%5D=2&sort_origin=user",
    "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
}


async def fetch_mathworks_jobs() -> dict:
    """
    Fetches jobs from MathWorks career page using BeautifulSoup.
    Returns dict with keys: jobs, retries, failed, recent_jobs.
    """
    logger.info("Fetching MathWorks jobs")

    max_retries = 3
    retries_used = 0
    parsed_jobs = []
    recent_jobs = []

    proxy = settings.PROXY_URL if settings.PROXY_URL else None
    if proxy:
        logger.info("Using proxy for MathWorks scrape")

    async with httpx.AsyncClient(follow_redirects=True, proxy=proxy) as client:
        try:
            response = None
            for attempt in range(1, max_retries + 1):
                try:
                    response = await client.get(MATHWORKS_SEARCH_URL, headers=HEADERS, timeout=30.0)
                    if response.status_code == 200:
                        break
                except (httpx.ConnectError, httpx.ConnectTimeout, httpx.RemoteProtocolError) as retry_err:
                    retries_used = attempt
                    if attempt < max_retries:
                        logger.warning(f"Retry {attempt}/{max_retries}: {type(retry_err).__name__}")
                        await asyncio.sleep(2 * attempt)
                    else:
                        raise

            if not response or response.status_code != 200:
                logger.error(f"MathWorks fetch failed: {response.status_code if response else 'N/A'}")
                return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}

            soup = BeautifulSoup(response.text, "html.parser")

            job_links = soup.find_all("a", href=re.compile(r"/company/jobs/opportunities/\d+-"))

            for link in job_links:
                try:
                    href = link.get("href", "")
                    if not href or "/search" in href:
                        continue

                    title = link.get_text(strip=True)
                    title = title.split("\n")[0].strip()
                    if not title or len(title) < 3:
                        continue

                    if any(kw.lower() in title.lower() for kw in settings.TITLE_FILTER_KEYWORDS):
                        logger.debug(f"Skipping job with filtered title: {title}")
                        continue

                    id_match = re.search(r"/(\d+)-", href)
                    if not id_match:
                        continue
                    external_id = id_match.group(1)

                    job_url = href if href.startswith("http") else f"{MATHWORKS_BASE_URL}{href}"
                    job_url = job_url.split("?")[0]

                    parent = link.find_parent("div") or link.find_parent("li")
                    parent_text = parent.get_text() if parent else ""

                    location = "US-MA-Natick"
                    loc_match = re.search(r"(US-[A-Z]{2}-[\w\s]+)", parent_text)
                    if loc_match:
                        location = loc_match.group(1).strip()

                    if any(
                        blocked.lower() in "mathworks".lower()
                        for blocked in settings.BLOCKED_COMPANIES
                    ):
                        logger.debug("Skipping job from blocked company: MathWorks")
                        continue

                    job_create = JobCreate(
                        title=title,
                        company="MathWorks",
                        location=location,
                        url=job_url,
                        source="MathWorks",
                        external_id=external_id,
                        posted_at=None,
                    )

                    parsed_jobs.append(job_create)
                    recent_jobs.append(job_create)

                except Exception as parse_err:
                    logger.debug(f"Failed to parse job link: {parse_err}")
                    continue

            logger.info(f"MathWorks: {len(parsed_jobs)} jobs parsed")
            return {
                "jobs": parsed_jobs,
                "retries": retries_used,
                "failed": False,
                "recent_jobs": recent_jobs,
            }

        except Exception as e:
            logger.error(f"MathWorks scraping failed: {type(e).__name__}: {e}")
            return {"jobs": [], "retries": retries_used, "failed": True, "recent_jobs": []}
