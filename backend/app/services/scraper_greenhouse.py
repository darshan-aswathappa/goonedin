"""
Greenhouse board fetch + parse primitives.

Greenhouse has no server-side search: each board's public API returns that
company's entire open-req list. We therefore fetch lists cheaply (without
`content`), filter to fresh + globally-relevant jobs client-side, then pull the
full description only for survivors. All functions here are pure/deterministic
so they can be unit-tested against a captured payload.

Board list API : https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
Single job API : https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{id}?content=true
"""

import html
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from bs4 import BeautifulSoup

from app.core.title_filter import is_title_blocked

logger = logging.getLogger("VelocityScraper")

BOARDS_API = "https://boards-api.greenhouse.io/v1/boards"

# Board fetch outcomes, so the crawler can update cursors correctly.
FETCH_OK = "ok"
FETCH_DEAD = "dead"      # 404 — board no longer exists
FETCH_ERROR = "error"    # transient (timeout, 5xx, parse) — retry later

CONTENT_TRUNCATE = 8000  # chars of description kept for analysis


@dataclass(frozen=True)
class ParsedJob:
    """A normalized Greenhouse job, pre-persistence."""
    external_id: int
    title: str
    company_name: str
    location_raw: str
    url: str
    first_published: Optional[datetime]
    updated_at: Optional[datetime]


def _parse_dt(value: Any) -> Optional[datetime]:
    """Parse a Greenhouse ISO timestamp (e.g. '2026-07-16T10:10:48-04:00')."""
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def parse_job(raw: dict, board_slug: str) -> Optional[ParsedJob]:
    """Map one raw Greenhouse job dict to a ParsedJob, or None if unusable."""
    job_id = raw.get("id")
    title = (raw.get("title") or "").strip()
    if not job_id or not title:
        return None

    location = ((raw.get("location") or {}).get("name") or "").strip()
    company = (raw.get("company_name") or board_slug or "").strip() or board_slug
    url = (raw.get("absolute_url") or "").strip()
    if not url:
        return None

    return ParsedJob(
        external_id=int(job_id),
        title=title,
        company_name=company,
        location_raw=location,
        url=url,
        first_published=_parse_dt(raw.get("first_published")),
        updated_at=_parse_dt(raw.get("updated_at")),
    )


def is_fresh(job: ParsedJob, freshness_hours: int, now: Optional[datetime] = None) -> bool:
    """True if the job was first published within `freshness_hours`.

    Uses first_published (a stable true post time); falls back to updated_at
    when a board omits it. Missing both → not fresh (avoids ingesting undated
    historical reqs on the first sweep).
    """
    now = now or datetime.now(timezone.utc)
    stamp = job.first_published or job.updated_at
    if stamp is None:
        return False
    age_hours = (now - stamp).total_seconds() / 3600
    return 0 <= age_hours <= freshness_hours


def is_globally_relevant(
    title: str,
    global_keywords: list[str],
    global_title_blocklist: list[str],
) -> bool:
    """Crawl-time relevance gate (cheap, coarse).

    Keeps the shared pool bounded: a job must match at least one active global
    keyword and must not hit the global title blocklist. Per-user keyword/
    location filtering happens later in the matcher. An empty keyword list is
    treated as 'match everything' so a misconfigured global list never silently
    drops the whole crawl.
    """
    if is_title_blocked(title, global_title_blocklist):
        return False
    if not global_keywords:
        return True
    lowered = title.lower()
    return any(kw.lower() in lowered for kw in global_keywords if kw)


def clean_content(raw_content: Optional[str]) -> str:
    """Greenhouse `content` is HTML-entity-escaped HTML. Unescape → strip tags.

    Returns plain text truncated for the analysis model, mirroring the Indeed
    description handling.
    """
    if not raw_content:
        return ""
    unescaped = html.unescape(raw_content)
    text = BeautifulSoup(unescaped, "html.parser").get_text(separator="\n", strip=True)
    return text[:CONTENT_TRUNCATE]


async def fetch_board_jobs(
    client: httpx.AsyncClient,
    slug: str,
) -> tuple[str, list[dict]]:
    """Fetch a board's job list WITHOUT content (cheap first pass).

    Returns (status, raw_jobs). status is FETCH_OK / FETCH_DEAD / FETCH_ERROR.
    """
    url = f"{BOARDS_API}/{slug}/jobs"
    try:
        resp = await client.get(url, timeout=20.0)
        if resp.status_code == 404:
            return FETCH_DEAD, []
        if resp.status_code != 200:
            logger.warning(f"[Greenhouse] {slug}: HTTP {resp.status_code}")
            return FETCH_ERROR, []
        data = resp.json()
        return FETCH_OK, data.get("jobs", []) or []
    except Exception as e:
        logger.warning(f"[Greenhouse] {slug} list fetch failed: {type(e).__name__}: {e}")
        return FETCH_ERROR, []


async def fetch_job_content(
    client: httpx.AsyncClient,
    slug: str,
    job_id: int,
) -> str:
    """Fetch a single job's full description and return cleaned plain text.

    Used only for survivors of the freshness/relevance filter, so we pay the
    content cost for a handful of jobs per board rather than the whole board.
    """
    url = f"{BOARDS_API}/{slug}/jobs/{job_id}?content=true"
    try:
        resp = await client.get(url, timeout=20.0)
        if resp.status_code != 200:
            return ""
        return clean_content(resp.json().get("content"))
    except Exception as e:
        logger.debug(f"[Greenhouse] {slug}/{job_id} content fetch failed: {e}")
        return ""
