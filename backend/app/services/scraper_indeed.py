"""
Indeed job scraper using Indeed's GraphQL API.

Searches each target keyword individually, deduplicates by job key,
applies client-side freshness and title filters, and returns JobCreate objects.

Search keywords and title filter keywords are loaded from the user's Supabase
settings (same as LinkedIn and other scrapers).

Indeed API limitation: date filters and attribute filters cannot be combined.
Strategy: server-side date filter (1h) + sort DATE, client-side title filtering.
"""

import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from bs4 import BeautifulSoup

from app.core.config import get_settings
from app.core.supabase_config import get_target_keywords, get_title_filter_keywords
from app.core.title_filter import is_title_blocked
from app.models.job import JobCreate

logger = logging.getLogger("VelocityScraper")

settings = get_settings()

INDEED_API_URL = "https://apis.indeed.com/graphql"

def _build_headers() -> dict:
    """Build Indeed API headers dynamically so INDEED_API_KEY is read each call."""
    if not settings.INDEED_API_KEY:
        logger.warning(
            "INDEED_API_KEY is empty — Indeed API requests will likely fail. "
            "Set INDEED_API_KEY in your environment or .env file."
        )
    return {
        "Host": "apis.indeed.com",
        "content-type": "application/json",
        "indeed-api-key": settings.INDEED_API_KEY,
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
                start: "1h"
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

MAX_AGE_HOURS = 24

# Batch size for parallel keyword fetches (avoid firing all at once)
KEYWORD_BATCH_SIZE = 4


def _is_fresh(job: dict) -> bool:
    """Check dateOnIndeed is within MAX_AGE_HOURS.

    Uses dateOnIndeed (not datePublished) because Indeed re-indexes old jobs
    with new dateOnIndeed timestamps. The server-side GraphQL filter also uses
    dateOnIndeed, so the client-side check must match.
    """
    date_on_indeed = job.get("dateOnIndeed")
    if not date_on_indeed:
        return False
    ts = date_on_indeed / 1000 if date_on_indeed > 1e12 else date_on_indeed
    posted = datetime.fromtimestamp(ts, tz=timezone.utc)
    age_hours = (datetime.now(timezone.utc) - posted).total_seconds() / 3600
    return age_hours <= MAX_AGE_HOURS


def _is_relevant(title: str, target_keywords: list[str]) -> bool:
    """Check if title matches any of the user's target keywords."""
    lower = title.lower()
    return any(kw.lower() in lower for kw in target_keywords)


def _is_blocked(title: str, title_filter_keywords: list[str]) -> bool:
    """Check if title matches any of the user's title filter (block) keywords."""
    return is_title_blocked(title, title_filter_keywords)


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


def _to_posted_at(job: dict) -> Optional[datetime]:
    """Convert a job's dateOnIndeed timestamp to a timezone-aware datetime.

    Uses dateOnIndeed (not datePublished) for consistency with _is_fresh() and
    the server-side GraphQL date filter, both of which use dateOnIndeed.
    """
    date_on_indeed = job.get("dateOnIndeed")
    if not date_on_indeed:
        return None
    ts = date_on_indeed / 1000 if date_on_indeed > 1e12 else date_on_indeed
    return datetime.fromtimestamp(ts, tz=timezone.utc)


async def _fetch_one_keyword(client: httpx.AsyncClient, search_term: str) -> Optional[list[dict]]:
    """Run one GraphQL query against Indeed and return raw job dicts.

    Returns:
        None  — on real errors (HTTP failure, GraphQL errors, exceptions,
                demand-control throttle). Counted as fetch_errors by caller.
        []    — on success with zero results. NOT counted as an error.
        list  — non-empty results on success.
    """
    query = INDEED_QUERY.replace("%SEARCH%", search_term.replace('"', '\\"'))
    payload = {"query": query}
    try:
        resp = await client.post(
            INDEED_API_URL,
            headers=_build_headers(),
            json=payload,
            timeout=30.0,
        )
        if not resp.is_success:
            logger.warning(f"[Indeed] HTTP {resp.status_code} for '{search_term}'")
            return None

        # Check Indeed's cost-based demand-control system (not HTTP 429)
        demand_result = resp.headers.get("demand-control-result")
        if demand_result is not None and demand_result.upper() != "COST_OK":
            logger.warning(f"[Indeed] demand-control-result={demand_result!r} for '{search_term}'")
            return None

        data = resp.json()
        if "errors" in data:
            logger.warning(f"[Indeed] GraphQL errors for '{search_term}': {data['errors']}")
            return None
        return data.get("data", {}).get("jobSearch", {}).get("results", [])
    except Exception as e:
        logger.error(f"[Indeed] Fetch failed for '{search_term}': {type(e).__name__}: {e}")
        return None


async def fetch_indeed_jobs(
    supabase: Any,
    user_id: str,
    client: Optional[httpx.AsyncClient] = None,
) -> dict:
    """
    Fetch Indeed jobs across the user's target keywords (from Supabase settings).
    Title filter keywords also come from user settings, matching LinkedIn behavior.

    Accepts an optional pre-built httpx client for connection pooling (reused
    across scraper cycles). If not provided, creates a one-shot client.

    Keywords are fetched in batches of KEYWORD_BATCH_SIZE to speed up scans
    while avoiding burst rate-limit triggers.

    Returns {"jobs": List[JobCreate], "retries": 0, "failed": bool}
    """
    # Load user-configured keywords from Supabase (same source as LinkedIn)
    search_keywords = await get_target_keywords(supabase, user_id)
    title_filter_kws = await get_title_filter_keywords(supabase, user_id)

    if not search_keywords:
        logger.warning(f"[Indeed] No target keywords configured for user {user_id}")
        return {"jobs": [], "retries": 0, "failed": False, "descriptions": {}}

    logger.info(f"[Indeed] Searching {len(search_keywords)} keywords for user {user_id}: {search_keywords}")

    seen_keys: set[str] = set()
    all_jobs: list[JobCreate] = []
    descriptions: dict[str, str] = {}
    fetch_errors = 0

    async def _process_results(results: list[dict]) -> None:
        for item in results:
            job = item.get("job", {})
            key = job.get("key", "")
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)

            title = job.get("title", "")

            # Client-side freshness check (uses dateOnIndeed to match server-side filter)
            if not _is_fresh(job):
                continue

            # Client-side title filters (from user settings)
            if _is_blocked(title, title_filter_kws):
                continue
            if not _is_relevant(title, search_keywords):
                continue

            # Extract fields
            employer = job.get("employer") or {}
            company = employer.get("name") or "Unknown Company"

            location_data = job.get("location") or {}
            formatted = location_data.get("formatted") or {}
            location = formatted.get("short") or formatted.get("long") or "USA"

            recruit = job.get("recruit") or {}
            url = recruit.get("viewJobUrl") or f"https://www.indeed.com/viewjob?jk={key}"

            salary = _format_salary(job.get("compensation"))
            posted_at = _to_posted_at(job)

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

    # Use provided client (connection pooling) or create a one-shot client
    proxy = settings.PROXY_URL if settings.PROXY_URL else None
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(proxy=proxy)

    try:
        # Fetch keywords in batches for faster scans
        for i in range(0, len(search_keywords), KEYWORD_BATCH_SIZE):
            batch = search_keywords[i:i + KEYWORD_BATCH_SIZE]
            batch_results = await asyncio.gather(
                *[_fetch_one_keyword(client, kw) for kw in batch]
            )

            for results in batch_results:
                if results is None:
                    # Real API error — count it toward failure threshold
                    fetch_errors += 1
                    continue
                # [] (no jobs for keyword) or populated list — both valid
                await _process_results(results)

            # Delay between batches (not between individual queries)
            if i + KEYWORD_BATCH_SIZE < len(search_keywords):
                await asyncio.sleep(random.uniform(1.5, 2.5))
    finally:
        if owns_client:
            await client.aclose()

    # Mark as failed if majority of keyword fetches returned errors
    total_fetches = len(search_keywords)
    failed = fetch_errors > (total_fetches * 0.8)
    if failed:
        logger.warning(f"[Indeed] {fetch_errors}/{total_fetches} keyword fetches failed for user {user_id}")

    logger.info(f"[Indeed] Fetched {len(all_jobs)} fresh relevant jobs from {len(search_keywords)} keyword searches")

    return {
        "jobs": all_jobs,
        "retries": 0,
        "failed": failed,
        "descriptions": descriptions,
    }
