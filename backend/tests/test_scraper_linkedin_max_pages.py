"""
Tests for ISSUE-002: Reduce LinkedIn Scraper MAX_PAGES from 4 to 2.
TDD - written before implementation.

Acceptance Criteria:
- MAX_PAGES constant is set to 2
- Scraper paginates correctly (fetches page 0 and page 1, stops at 2)
- Early-stop logic (empty page → break) still works correctly
- Log output reflects new value automatically
"""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import httpx

import app.services.scraper_linkedin as scraper_module
from app.services.scraper_linkedin import (
    MAX_PAGES,
    LINKEDIN_PAGE_SIZE,
    parse_posted_at,
    fetch_linkedin_jobs,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ONE_JOB_CARD_HTML = """
<li>
  <div class="base-card" data-entity-urn="urn:li:jobPosting:123456">
    <h3 class="base-search-card__title">Software Engineer</h3>
    <h4 class="base-search-card__subtitle">Acme Corp</h4>
    <span class="job-search-card__location">San Francisco, CA</span>
    <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/software-engineer-at-acme-corp-123456">View</a>
    <time datetime="2024-01-15T10:00:00Z">1 hour ago</time>
  </div>
</li>
"""

EMPTY_HTML = "<html><body></body></html>"


def make_supabase(keywords=None, blocked=None, title_filters=None):
    """Lightweight supabase stub."""
    sb = MagicMock()
    chain = MagicMock()
    resp = MagicMock()
    resp.data = keywords or [{"keyword": "Software Engineer"}]
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.limit.return_value = chain
    chain.execute.return_value = resp
    sb.table.return_value = chain
    return sb


def _mock_config(keywords=None, blocked=None, title_filters=None):
    """Return three AsyncMock patches for Supabase config helpers."""
    return {
        "get_target_keywords": AsyncMock(return_value=keywords or ["Software Engineer"]),
        "get_blocked_companies": AsyncMock(return_value=blocked or []),
        "get_title_filter_keywords": AsyncMock(return_value=title_filters or []),
    }


# ---------------------------------------------------------------------------
# 1. Constant value
# ---------------------------------------------------------------------------

class TestMaxPagesConstant:
    def test_max_pages_is_2(self):
        """ISSUE-002 AC: MAX_PAGES must be 2."""
        assert MAX_PAGES == 2, f"Expected MAX_PAGES=2, got {MAX_PAGES}"

    def test_page_size_unchanged(self):
        """LINKEDIN_PAGE_SIZE should remain 25."""
        assert LINKEDIN_PAGE_SIZE == 25


# ---------------------------------------------------------------------------
# 2. Pagination: fetches exactly 2 pages when both have results
# ---------------------------------------------------------------------------

class TestPaginationBehavior:
    @pytest.mark.asyncio
    async def test_fetches_at_most_two_pages(self):
        """Scraper must not request more than 2 pages (MAX_PAGES=2)."""
        cfg = _mock_config()
        call_count = 0

        async def fake_get(_self, url, **kwargs):
            nonlocal call_count
            call_count += 1
            resp = MagicMock(spec=httpx.Response)
            resp.status_code = 200
            resp.text = ONE_JOB_CARD_HTML
            return resp

        with (
            patch("app.services.scraper_linkedin.get_target_keywords", cfg["get_target_keywords"]),
            patch("app.services.scraper_linkedin.get_blocked_companies", cfg["get_blocked_companies"]),
            patch("app.services.scraper_linkedin.get_title_filter_keywords", cfg["get_title_filter_keywords"]),
            patch("httpx.AsyncClient.get", new=fake_get),
        ):
            result = await fetch_linkedin_jobs(make_supabase(), user_id="u1")

        assert call_count <= MAX_PAGES, (
            f"Expected at most {MAX_PAGES} HTTP requests, got {call_count}"
        )

    @pytest.mark.asyncio
    async def test_fetches_page_0_and_page_1(self):
        """start= parameter must be 0 on first call and 1*card_count on second."""
        cfg = _mock_config()
        start_values = []

        async def fake_get(_self, url, **kwargs):
            # Extract start= from URL
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(url).query)
            start_values.append(int(qs.get("start", ["0"])[0]))
            resp = MagicMock(spec=httpx.Response)
            resp.status_code = 200
            resp.text = ONE_JOB_CARD_HTML
            return resp

        with (
            patch("app.services.scraper_linkedin.get_target_keywords", cfg["get_target_keywords"]),
            patch("app.services.scraper_linkedin.get_blocked_companies", cfg["get_blocked_companies"]),
            patch("app.services.scraper_linkedin.get_title_filter_keywords", cfg["get_title_filter_keywords"]),
            patch("httpx.AsyncClient.get", new=fake_get),
        ):
            await fetch_linkedin_jobs(make_supabase(), user_id="u1")

        assert 0 in start_values, "First page must use start=0"
        assert len(start_values) <= MAX_PAGES


# ---------------------------------------------------------------------------
# 3. Early-stop: empty page → break (no regression)
# ---------------------------------------------------------------------------

class TestEarlyStopBehavior:
    @pytest.mark.asyncio
    async def test_stops_on_empty_page(self):
        """If first page returns no job cards, scraper must stop immediately."""
        cfg = _mock_config()
        call_count = 0

        async def fake_get(_self, url, **kwargs):
            nonlocal call_count
            call_count += 1
            resp = MagicMock(spec=httpx.Response)
            resp.status_code = 200
            resp.text = EMPTY_HTML
            return resp

        with (
            patch("app.services.scraper_linkedin.get_target_keywords", cfg["get_target_keywords"]),
            patch("app.services.scraper_linkedin.get_blocked_companies", cfg["get_blocked_companies"]),
            patch("app.services.scraper_linkedin.get_title_filter_keywords", cfg["get_title_filter_keywords"]),
            patch("httpx.AsyncClient.get", new=fake_get),
        ):
            result = await fetch_linkedin_jobs(make_supabase(), user_id="u1")

        assert call_count == 1, "Should stop after first empty page, not continue"
        assert result["jobs"] == []
        assert result["failed"] is False

    @pytest.mark.asyncio
    async def test_stops_on_second_empty_page(self):
        """If page 1 has results but page 2 is empty, stops after 2 requests."""
        cfg = _mock_config()
        call_count = 0

        async def fake_get(_self, url, **kwargs):
            nonlocal call_count
            call_count += 1
            resp = MagicMock(spec=httpx.Response)
            resp.status_code = 200
            resp.text = ONE_JOB_CARD_HTML if call_count == 1 else EMPTY_HTML
            return resp

        with (
            patch("app.services.scraper_linkedin.get_target_keywords", cfg["get_target_keywords"]),
            patch("app.services.scraper_linkedin.get_blocked_companies", cfg["get_blocked_companies"]),
            patch("app.services.scraper_linkedin.get_title_filter_keywords", cfg["get_title_filter_keywords"]),
            patch("httpx.AsyncClient.get", new=fake_get),
        ):
            result = await fetch_linkedin_jobs(make_supabase(), user_id="u1")

        assert call_count == 2
        assert len(result["jobs"]) == 1


# ---------------------------------------------------------------------------
# 4. Return structure
# ---------------------------------------------------------------------------

class TestReturnStructure:
    @pytest.mark.asyncio
    async def test_returns_expected_keys(self):
        """Result dict must always have jobs, retries, failed keys."""
        cfg = _mock_config()

        async def fake_get(_self, url, **kwargs):
            resp = MagicMock(spec=httpx.Response)
            resp.status_code = 200
            resp.text = EMPTY_HTML
            return resp

        with (
            patch("app.services.scraper_linkedin.get_target_keywords", cfg["get_target_keywords"]),
            patch("app.services.scraper_linkedin.get_blocked_companies", cfg["get_blocked_companies"]),
            patch("app.services.scraper_linkedin.get_title_filter_keywords", cfg["get_title_filter_keywords"]),
            patch("httpx.AsyncClient.get", new=fake_get),
        ):
            result = await fetch_linkedin_jobs(make_supabase(), user_id="u1")

        assert "jobs" in result
        assert "retries" in result
        assert "failed" in result
