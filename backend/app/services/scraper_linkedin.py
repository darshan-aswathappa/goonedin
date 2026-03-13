import re
import asyncio
import httpx
import logging
import urllib.parse
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta
from app.core.config import get_settings
from app.core.supabase_config import get_target_keywords, get_blocked_companies, get_title_filter_keywords
from app.models.job import JobCreate
from random_user_agent.user_agent import UserAgent

settings = get_settings()
logger = logging.getLogger("VelocityScraper")
ua = UserAgent()

HEADERS = {
    "User-Agent": ua.get_random_user_agent(),
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.linkedin.com/jobs",
    "X-Requested-With": "XMLHttpRequest",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


def parse_posted_at(time_tag) -> datetime | None:
    """
    Parses a LinkedIn <time> tag into a timezone-aware datetime.
    Tries the datetime attribute first, then falls back to the text content.
    """
    if not time_tag:
        return None

    now = datetime.now(timezone.utc)

    # Try the datetime attribute — recent jobs often have a full ISO datetime here
    dt_str = time_tag.get("datetime", "").strip()
    if dt_str and "T" in dt_str:
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except ValueError:
            pass

    # Fall back to parsing the human-readable text ("5 minutes ago", "2 hours ago", etc.)
    text = time_tag.get_text(strip=True).lower()

    if "just now" in text or "moment" in text:
        return now

    m = re.search(r"(\d+)\s+minute", text)
    if m:
        return now - timedelta(minutes=int(m.group(1)))

    m = re.search(r"(\d+)\s+hour", text)
    if m:
        return now - timedelta(hours=int(m.group(1)))

    m = re.search(r"(\d+)\s+day", text)
    if m:
        return now - timedelta(days=int(m.group(1)))

    # Last resort: just a date string like "2024-01-15"
    if dt_str:
        try:
            return datetime.strptime(dt_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    return None


LINKEDIN_PAGE_SIZE = 25   # LinkedIn returns ~25 jobs per page
MAX_PAGES = 4             # Cap at 4 pages (100 jobs) to avoid rate-limiting


async def fetch_linkedin_jobs(supabase, user_id: str, keywords: str = None, location: str = None) -> dict:
    """
    Hits the public LinkedIn guest API and parses the HTML response
    into a list of JobCreate objects with real posted_at timestamps.
    Paginates up to MAX_PAGES pages to capture all recent jobs.
    Uses filters: sortBy=DD (date), f_TPR=r3600 (last 1 hour), f_JT=F (full-time), f_E=2,3 (entry/associate).
    Returns dict with keys: jobs, retries, failed.
    """
    target_keywords = await get_target_keywords(supabase, user_id)
    search_term = keywords or (target_keywords[0] if target_keywords else "Software Engineer")
    search_location = location or "United States"
    encoded_keywords = urllib.parse.quote(search_term)
    encoded_location = urllib.parse.quote_plus(search_location)

    base_url = (
        f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
        f"?keywords={encoded_keywords}"
        f"&sortBy=DD"
        f"&f_TPR=r3600"
        f"&f_JT=F"
        f"&f_E=2,3"
        f"&f_WT=1,2,3"
        f"&location={encoded_location}"
    )

    logger.info(f"[LinkedIn] Starting paginated fetch for '{search_term}' in {search_location} (up to {MAX_PAGES} pages)")

    # Get config from Supabase (once, before pagination loop)
    title_filter_keywords = await get_title_filter_keywords(supabase, user_id)
    blocked_companies = await get_blocked_companies(supabase, user_id)

    max_retries = 3
    total_retries = 0
    parsed_jobs = []
    start = 0          # cursor-based: advances by actual cards returned, not a fixed 25
    pages_fetched = 0

    # Rotate User-Agent per pagination session to avoid fingerprinting
    headers = {**HEADERS, "User-Agent": ua.get_random_user_agent()}

    async with httpx.AsyncClient(follow_redirects=True) as client:
        for page in range(MAX_PAGES):
            url = f"{base_url}&start={start}"

            try:
                response = None
                for attempt in range(1, max_retries + 1):
                    try:
                        response = await client.get(url, headers=headers, timeout=15.0)
                        break
                    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.RemoteProtocolError) as retry_err:
                        total_retries += 1
                        if attempt < max_retries:
                            logger.warning(f"Retry {attempt}/{max_retries} for '{search_term}' page {page + 1}: {type(retry_err).__name__}")
                            await asyncio.sleep(1 * attempt)
                        else:
                            raise

                if response.status_code != 200:
                    logger.error(f"[LinkedIn] Page {page + 1} for '{search_term}': HTTP {response.status_code}")
                    if page == 0:
                        return {"jobs": [], "retries": total_retries, "failed": True}
                    break

                if not response.text or not response.text.strip():
                    logger.info(f"[LinkedIn] Page {page + 1}/{MAX_PAGES} for '{search_term}' (start={start}): empty response, stopping")
                    break

                soup = BeautifulSoup(response.text, "html.parser")
                job_cards = [li for li in soup.find_all("li") if li.find("h3", class_="base-search-card__title")]

                if not job_cards:
                    logger.info(f"[LinkedIn] Page {page + 1}/{MAX_PAGES} for '{search_term}' (start={start}): 0 cards, stopping")
                    break

                pages_fetched += 1
                page_count = 0
                for card in job_cards:
                    try:
                        title_tag = card.find("h3", class_="base-search-card__title")
                        title = title_tag.get_text(strip=True) if title_tag else None
                        if not title:
                            continue

                        if any(kw in title.lower() for kw in title_filter_keywords):
                            logger.debug(f"Skipping job with filtered title: {title}")
                            continue

                        company_tag = card.find("h4", class_="base-search-card__subtitle")
                        company = company_tag.get_text(strip=True) if company_tag else "Unknown Company"

                        if any(blocked.lower() in company.lower() for blocked in blocked_companies):
                            logger.info(f"Skipping job from blocked company: {company}")
                            continue

                        location_tag = card.find("span", class_="job-search-card__location")
                        location = location_tag.get_text(strip=True) if location_tag else "Unknown Location"

                        link_tag = card.find("a", class_="base-card__full-link")
                        job_url = link_tag["href"].split("?")[0] if link_tag else ""
                        if not job_url:
                            continue

                        external_id = None
                        id_match = re.search(r"-(\d+)$", job_url) or re.search(r"/(\d+)/?$", job_url)
                        if id_match:
                            external_id = id_match.group(1)
                        else:
                            urn = card.find("div", attrs={"data-entity-urn": True})
                            if urn:
                                external_id = urn["data-entity-urn"].split(":")[-1]
                        if not external_id:
                            continue

                        time_tag = card.find("time")
                        posted_at = parse_posted_at(time_tag)

                        parsed_jobs.append(JobCreate(
                            title=title,
                            company=company,
                            location=location,
                            url=job_url,
                            source="LinkedIn",
                            external_id=external_id,
                            posted_at=posted_at,
                        ))
                        page_count += 1

                    except Exception as parse_err:
                        logger.warning(f"Failed to parse a job card: {parse_err}")
                        continue

                logger.info(f"[LinkedIn] Page {page + 1}/{MAX_PAGES} for '{search_term}' (start={start}): {len(job_cards)} cards, {page_count} jobs passed filters (total so far: {len(parsed_jobs)})")

                # Advance cursor by actual number of cards returned
                start += len(job_cards)

            except Exception as e:
                logger.error(f"[LinkedIn] FAILED '{search_term}' page {page + 1} (start={start}): {type(e).__name__}: {e}")
                if page == 0:
                    return {"jobs": [], "retries": total_retries, "failed": True}
                break

    logger.info(f"[LinkedIn] DONE '{search_term}' in {search_location}: {len(parsed_jobs)} total jobs from {pages_fetched} pages")
    return {"jobs": parsed_jobs, "retries": total_retries, "failed": False}
