"""
Indeed job scraper using Indeed's GraphQL API.

Searches each target keyword individually, deduplicates by job key,
applies client-side freshness and title filters, and returns JobCreate objects.

Indeed API limitation: date filters and attribute filters cannot be combined.
Strategy: server-side date filter (4h) + sort DATE, client-side title filtering.
"""

import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from bs4 import BeautifulSoup

from app.models.job import JobCreate

logger = logging.getLogger("VelocityScraper")

INDEED_API_URL = "https://apis.indeed.com/graphql"

INDEED_HEADERS = {
    "Host": "apis.indeed.com",
    "content-type": "application/json",
    "indeed-api-key": "161092c2017b5bbab13edb12461a62d5a833871e7cad6d9d475304573de67ac8",
    "accept": "application/json",
    "indeed-locale": "en-US",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Indeed App 193.1"
    ),
    "indeed-app-info": "appv=193.1; appid=com.indeed.jobsearch; osv=16.6.1; os=ios; dtype=phone",
}

INDEED_QUERY = """
query GetJobData {
    jobSearch(
        what: "%SEARCH%"
        location: {where: "USA", radius: 100, radiusUnit: MILES}
        limit: 100
        sort: DATE
        filters: {
            date: {
                field: "dateOnIndeed"
                start: "4h"
            }
        }
    ) {
        results {
            job {
                key
                title
                datePublished
                dateOnIndeed
                description {
                    html
                }
                employer {
                    name
                }
                compensation {
                    baseSalary {
                        unitOfWork
                        range {
                            ... on Range {
                                min
                                max
                            }
                        }
                    }
                    currencyCode
                }
                location {
                    formatted {
                        short
                        long
                    }
                }
                recruit {
                    viewJobUrl
                }
            }
        }
    }
}
"""

# Search terms: each is queried individually against Indeed
INDEED_SEARCH_KEYWORDS = [
    "Software Engineer",
    "Software Developer",
    "Backend Developer",
    "Full Stack Developer",
    "FullStack Developer",
    "Java Developer",
    "Python Developer",
    "New Grad Software",
    "Entry Level Software Engineer",
    "Associate Software Engineer",
    "Junior Software Developer",
    "Junior Software Engineer",
    "SWE",
    "Entry Level Software Developer",
]

# Client-side title relevance filter
INCLUDE_TITLE_KEYWORDS = [
    "software", "developer", "backend", "full stack", "fullstack",
    "java", "python", "swe", "front end", "frontend",
    ".net", "devops", "dev ops", "golang", "rust", "node",
    "react", "angular", "typescript", "javascript", "c#", "c++",
    "data engineer", "ml engineer", "machine learning engineer",
]

# Client-side title block filter
BLOCK_TITLE_KEYWORDS = [
    "senior", "principal", "manager", "staff", "sr.", "lead", "director",
    "nurse", "therapist", "veterinarian",
]

MAX_AGE_HOURS = 4


def _is_fresh(date_published) -> bool:
    """Check datePublished is within MAX_AGE_HOURS (Indeed re-indexes old jobs)."""
    if not date_published:
        return False
    ts = date_published / 1000 if date_published > 1e12 else date_published
    posted = datetime.fromtimestamp(ts, tz=timezone.utc)
    age_hours = (datetime.now(timezone.utc) - posted).total_seconds() / 3600
    return age_hours <= MAX_AGE_HOURS


def _is_relevant(title: str) -> bool:
    lower = title.lower()
    return any(kw in lower for kw in INCLUDE_TITLE_KEYWORDS)


def _is_blocked(title: str) -> bool:
    lower = title.lower()
    return any(kw in lower for kw in BLOCK_TITLE_KEYWORDS)


def _format_salary(compensation: Optional[dict]) -> Optional[str]:
    """Format Indeed's compensation object into a salary string."""
    if not compensation:
        return None
    base = compensation.get("baseSalary")
    if not base:
        return None
    salary_range = base.get("range")
    if not salary_range:
        return None
    min_val = salary_range.get("min")
    max_val = salary_range.get("max")
    currency = compensation.get("currencyCode", "USD")
    unit = base.get("unitOfWork", "YEAR")

    if min_val and max_val:
        if unit == "YEAR":
            return f"${min_val:,.0f} - ${max_val:,.0f} {currency}/yr"
        elif unit == "HOUR":
            return f"${min_val:.0f} - ${max_val:.0f} {currency}/hr"
        return f"${min_val:,.0f} - ${max_val:,.0f} {currency}"
    elif min_val:
        return f"${min_val:,.0f}+ {currency}"
    elif max_val:
        return f"Up to ${max_val:,.0f} {currency}"
    return None


def _extract_description_text(html: str) -> str:
    """Strip HTML tags from Indeed description, truncate for DeepSeek."""
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(separator="\n", strip=True)
    return text[:8000]


def _to_posted_at(date_published) -> Optional[datetime]:
    """Convert Indeed's datePublished (unix ts) to datetime."""
    if not date_published:
        return None
    ts = date_published / 1000 if date_published > 1e12 else date_published
    return datetime.fromtimestamp(ts, tz=timezone.utc)


async def _fetch_one_keyword(client: httpx.AsyncClient, search_term: str) -> list[dict]:
    """Run one GraphQL query against Indeed and return raw job dicts."""
    query = INDEED_QUERY.replace("%SEARCH%", search_term.replace('"', '\\"'))
    payload = {"query": query}
    try:
        resp = await client.post(
            INDEED_API_URL,
            headers=INDEED_HEADERS,
            json=payload,
            timeout=30.0,
        )
        if not resp.is_success:
            logger.warning(f"[Indeed] HTTP {resp.status_code} for '{search_term}'")
            return []
        data = resp.json()
        if "errors" in data:
            logger.warning(f"[Indeed] GraphQL errors for '{search_term}': {data['errors']}")
            return []
        return data.get("data", {}).get("jobSearch", {}).get("results", [])
    except Exception as e:
        logger.error(f"[Indeed] Fetch failed for '{search_term}': {e}")
        return []


async def fetch_indeed_jobs(supabase: Any, user_id: str) -> dict:
    """
    Fetch Indeed jobs across all target keywords.
    Returns {"jobs": List[JobCreate], "retries": 0, "failed": bool}
    """
    seen_keys: set[str] = set()
    all_jobs: list[JobCreate] = []
    # Store raw descriptions for analysis passthrough (keyed by external_id)
    descriptions: dict[str, str] = {}
    failed = False

    async with httpx.AsyncClient(verify=False) as client:
        for kw in INDEED_SEARCH_KEYWORDS:
            results = await _fetch_one_keyword(client, kw)

            for item in results:
                job = item.get("job", {})
                key = job.get("key", "")
                if not key or key in seen_keys:
                    continue
                seen_keys.add(key)

                title = job.get("title", "")
                date_published = job.get("datePublished")

                # Client-side freshness check
                if not _is_fresh(date_published):
                    continue

                # Client-side title filters
                if _is_blocked(title):
                    continue
                if not _is_relevant(title):
                    continue

                # Extract fields
                employer = job.get("employer") or {}
                company = employer.get("name") or "Unknown Company"

                location_data = job.get("location") or {}
                formatted = location_data.get("formatted") or {}
                location = formatted.get("short") or formatted.get("long") or "USA"

                # URL: prefer recruit.viewJobUrl, fallback to constructed URL
                recruit = job.get("recruit") or {}
                url = recruit.get("viewJobUrl") or f"https://www.indeed.com/viewjob?jk={key}"

                salary = _format_salary(job.get("compensation"))
                posted_at = _to_posted_at(date_published)

                # Description for analysis passthrough
                desc_html = (job.get("description") or {}).get("html", "")
                desc_text = _extract_description_text(desc_html)
                if desc_text:
                    descriptions[key] = desc_text

                all_jobs.append(JobCreate(
                    external_id=key,
                    title=title,
                    company=company,
                    location=location,
                    url=url,
                    source="Indeed",
                    posted_at=posted_at,
                    salary=salary,
                ))

            # Delay between keyword searches to avoid rate limiting
            await asyncio.sleep(random.uniform(1.5, 2.5))

    logger.info(f"[Indeed] Fetched {len(all_jobs)} fresh relevant jobs from {len(INDEED_SEARCH_KEYWORDS)} keyword searches")

    return {
        "jobs": all_jobs,
        "retries": 0,
        "failed": failed,
        "descriptions": descriptions,
    }
