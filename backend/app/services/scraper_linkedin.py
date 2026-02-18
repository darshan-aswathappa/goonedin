import re
import httpx
import logging
import urllib.parse
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta
from app.core.config import get_settings
from app.models.job import JobCreate

settings = get_settings()
logger = logging.getLogger("VelocityScraper")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
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


async def fetch_linkedin_jobs(keywords: str = None) -> list[JobCreate]:
    """
    Hits the public LinkedIn guest API and parses the HTML response
    into a list of JobCreate objects with real posted_at timestamps.
    """
    search_term = keywords or (settings.TARGET_KEYWORDS[0] if settings.TARGET_KEYWORDS else "Software Engineer")
    encoded_keywords = urllib.parse.quote(search_term)
    url = f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={encoded_keywords}&start=0"

    logger.info(f"Pinging LinkedIn Guest API for: {search_term}")

    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            response = await client.get(url, headers=HEADERS, timeout=15.0)

            if response.status_code != 200:
                logger.error(f"LinkedIn API Error: {response.status_code}")
                return []

            if not response.text:
                return []

            logger.info("Successfully retrieved raw job data from LinkedIn! Parsing HTML...")

            soup = BeautifulSoup(response.text, "html.parser")
            job_cards = soup.find_all("li")
            parsed_jobs = []

            for card in job_cards:
                try:
                    title_tag = card.find("h3", class_="base-search-card__title")
                    title = title_tag.get_text(strip=True) if title_tag else None
                    if not title:
                        continue  # skip empty/malformed cards

                    company_tag = card.find("h4", class_="base-search-card__subtitle")
                    company = company_tag.get_text(strip=True) if company_tag else "Unknown Company"

                    location_tag = card.find("span", class_="job-search-card__location")
                    location = location_tag.get_text(strip=True) if location_tag else "Unknown Location"

                    link_tag = card.find("a", class_="base-card__full-link")
                    job_url = link_tag["href"].split("?")[0] if link_tag else ""
                    if not job_url:
                        continue

                    # Extract numeric LinkedIn job ID from the URL
                    external_id = None
                    id_match = re.search(r"-(\d+)$", job_url) or re.search(r"/(\d+)/?$", job_url)
                    if id_match:
                        external_id = id_match.group(1)
                    else:
                        # Also try data-entity-urn on the card div
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

                except Exception as parse_err:
                    logger.warning(f"Failed to parse a job card: {parse_err}")
                    continue

            logger.info(f"Parsed {len(parsed_jobs)} jobs for '{search_term}'.")
            return parsed_jobs

        except Exception as e:
            logger.error(f"Scraping failed: {str(e)}")
            return []
