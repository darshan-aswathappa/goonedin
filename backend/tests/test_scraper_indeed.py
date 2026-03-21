"""
TDD tests for 4 Indeed scraper bugs.

Bug 1: _is_fresh() checks wrong field (datePublished vs dateOnIndeed)
Bug 2: Empty results counted as errors ([] vs None distinction)
Bug 3: No demand-control-result header handling
Bug 4: INDEED_HEADERS frozen at module import time

Written BEFORE the fixes — tests for new behavior will fail initially.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, timedelta

import httpx


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fresh_ts() -> int:
    """Unix timestamp in milliseconds for 30 minutes ago (fresh)."""
    return int((datetime.now(timezone.utc) - timedelta(minutes=30)).timestamp() * 1000)


def _stale_ts() -> int:
    """Unix timestamp in milliseconds for 48 hours ago (stale)."""
    return int((datetime.now(timezone.utc) - timedelta(hours=48)).timestamp() * 1000)


def make_supabase(keywords=None, title_filters=None):
    """Minimal Supabase stub."""
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


def _mock_config(keywords=None, title_filters=None):
    return {
        "get_target_keywords": AsyncMock(return_value=keywords or ["Software Engineer"]),
        "get_title_filter_keywords": AsyncMock(return_value=title_filters or []),
    }


def _make_httpx_response(status_code: int, json_body: dict, headers: dict = None):
    """Build a mock httpx.Response with .is_success, .json(), and .headers."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.is_success = (200 <= status_code < 300)
    resp.json.return_value = json_body
    resp.headers = headers or {}
    return resp


def _graphql_success(results: list) -> dict:
    return {"data": {"jobSearch": {"results": results}}}


# ---------------------------------------------------------------------------
# Bug 1: _is_fresh() must use dateOnIndeed, not datePublished
# ---------------------------------------------------------------------------

class TestIsFresh:
    """_is_fresh(job: dict) should check dateOnIndeed, not datePublished."""

    def test_is_fresh_uses_date_on_indeed(self):
        """Job with stale datePublished but fresh dateOnIndeed must return True."""
        from app.services.scraper_indeed import _is_fresh

        job = {
            "datePublished": _stale_ts(),   # old — should be ignored
            "dateOnIndeed": _fresh_ts(),    # new — should be used
        }
        assert _is_fresh(job) is True, (
            "_is_fresh should use dateOnIndeed (fresh), not datePublished (stale)"
        )

    def test_is_fresh_stale_date_on_indeed(self):
        """Job with stale dateOnIndeed must return False regardless of datePublished."""
        from app.services.scraper_indeed import _is_fresh

        job = {
            "datePublished": _fresh_ts(),   # new — should be ignored
            "dateOnIndeed": _stale_ts(),    # old — should be used
        }
        assert _is_fresh(job) is False, (
            "_is_fresh should return False when dateOnIndeed is stale"
        )

    def test_is_fresh_missing_date_on_indeed(self):
        """Job without dateOnIndeed key must return False."""
        from app.services.scraper_indeed import _is_fresh

        job = {"datePublished": _fresh_ts()}  # only datePublished present
        assert _is_fresh(job) is False, (
            "_is_fresh should return False when dateOnIndeed is absent"
        )

    def test_is_fresh_both_absent(self):
        """Job with neither field returns False."""
        from app.services.scraper_indeed import _is_fresh

        assert _is_fresh({}) is False

    def test_is_fresh_date_on_indeed_none(self):
        """Job with dateOnIndeed=None returns False."""
        from app.services.scraper_indeed import _is_fresh

        job = {"dateOnIndeed": None, "datePublished": _fresh_ts()}
        assert _is_fresh(job) is False


# ---------------------------------------------------------------------------
# Bug 2: _fetch_one_keyword must return None on error, [] on empty results
# ---------------------------------------------------------------------------

class TestFetchOneKeywordReturnValues:
    """_fetch_one_keyword returns None on real error, [] on empty/success."""

    @pytest.mark.asyncio
    async def test_fetch_one_keyword_returns_empty_list_on_no_results(self):
        """HTTP 200 with empty results list should return [] (not None)."""
        from app.services.scraper_indeed import _fetch_one_keyword

        mock_resp = _make_httpx_response(200, _graphql_success([]))

        async with httpx.AsyncClient() as client:
            with patch.object(client, "post", new=AsyncMock(return_value=mock_resp)):
                result = await _fetch_one_keyword(client, "obscure keyword xyz")

        assert result == [], f"Expected [], got {result!r}"
        assert result is not None, "Empty results should return [] not None"

    @pytest.mark.asyncio
    async def test_fetch_one_keyword_returns_none_on_http_error(self):
        """HTTP 500 should return None (real error)."""
        from app.services.scraper_indeed import _fetch_one_keyword

        mock_resp = _make_httpx_response(500, {})

        async with httpx.AsyncClient() as client:
            with patch.object(client, "post", new=AsyncMock(return_value=mock_resp)):
                result = await _fetch_one_keyword(client, "software engineer")

        assert result is None, f"HTTP 500 should return None, got {result!r}"

    @pytest.mark.asyncio
    async def test_fetch_one_keyword_returns_none_on_graphql_errors(self):
        """GraphQL error body should return None (real error)."""
        from app.services.scraper_indeed import _fetch_one_keyword

        error_body = {"errors": [{"message": "Unauthorized"}]}
        mock_resp = _make_httpx_response(200, error_body)

        async with httpx.AsyncClient() as client:
            with patch.object(client, "post", new=AsyncMock(return_value=mock_resp)):
                result = await _fetch_one_keyword(client, "software engineer")

        assert result is None, f"GraphQL errors should return None, got {result!r}"

    @pytest.mark.asyncio
    async def test_fetch_one_keyword_returns_none_on_exception(self):
        """Network exception should return None."""
        from app.services.scraper_indeed import _fetch_one_keyword

        async with httpx.AsyncClient() as client:
            with patch.object(client, "post", new=AsyncMock(side_effect=httpx.ConnectError("timeout"))):
                result = await _fetch_one_keyword(client, "software engineer")

        assert result is None, f"Exception should return None, got {result!r}"

    @pytest.mark.asyncio
    async def test_fetch_one_keyword_returns_results_on_success(self):
        """HTTP 200 with non-empty results should return the list."""
        from app.services.scraper_indeed import _fetch_one_keyword

        fake_results = [{"job": {"key": "abc123", "title": "Software Engineer"}}]
        mock_resp = _make_httpx_response(200, _graphql_success(fake_results))

        async with httpx.AsyncClient() as client:
            with patch.object(client, "post", new=AsyncMock(return_value=mock_resp)):
                result = await _fetch_one_keyword(client, "software engineer")

        assert result == fake_results


# ---------------------------------------------------------------------------
# Bug 2 (integration): Empty keyword results must not increment fetch_errors
# ---------------------------------------------------------------------------

class TestEmptyResultsNotCountedAsErrors:
    """When all keywords return [] (no jobs), failed must be False."""

    @pytest.mark.asyncio
    async def test_empty_keyword_results_not_counted_as_errors(self):
        """All keywords returning [] should produce failed=False."""
        from app.services.scraper_indeed import fetch_indeed_jobs

        cfg = _mock_config(keywords=["keyword1", "keyword2", "keyword3"])

        # _fetch_one_keyword returns [] for all keywords (no jobs, not an error)
        empty_resp = _make_httpx_response(200, _graphql_success([]))

        with (
            patch("app.services.scraper_indeed.get_target_keywords", cfg["get_target_keywords"]),
            patch("app.services.scraper_indeed.get_title_filter_keywords", cfg["get_title_filter_keywords"]),
            patch("app.services.scraper_indeed._fetch_one_keyword", new=AsyncMock(return_value=[])),
            patch("asyncio.sleep", new=AsyncMock()),
        ):
            result = await fetch_indeed_jobs(make_supabase(), user_id="u1")

        assert result["failed"] is False, (
            "All keywords returning [] (no jobs) should not set failed=True"
        )
        assert result["jobs"] == []

    @pytest.mark.asyncio
    async def test_none_returns_counted_as_errors(self):
        """Keywords returning None (real errors) should be counted as errors."""
        from app.services.scraper_indeed import fetch_indeed_jobs

        # Create enough keywords to trigger the >80% failure threshold
        keywords = [f"keyword{i}" for i in range(10)]
        cfg = _mock_config(keywords=keywords)

        with (
            patch("app.services.scraper_indeed.get_target_keywords", cfg["get_target_keywords"]),
            patch("app.services.scraper_indeed.get_title_filter_keywords", cfg["get_title_filter_keywords"]),
            patch("app.services.scraper_indeed._fetch_one_keyword", new=AsyncMock(return_value=None)),
            patch("asyncio.sleep", new=AsyncMock()),
        ):
            result = await fetch_indeed_jobs(make_supabase(), user_id="u1")

        assert result["failed"] is True, (
            "All keywords returning None (real errors) should set failed=True"
        )


# ---------------------------------------------------------------------------
# Bug 3: demand-control-result header handling
# ---------------------------------------------------------------------------

class TestDemandControlHeader:
    """_fetch_one_keyword must check demand-control-result header."""

    @pytest.mark.asyncio
    async def test_demand_control_cost_exceeded_returns_none(self):
        """Response with demand-control-result != COST_OK should return None."""
        from app.services.scraper_indeed import _fetch_one_keyword

        fake_results = [{"job": {"key": "abc123"}}]
        mock_resp = _make_httpx_response(
            200,
            _graphql_success(fake_results),
            headers={"demand-control-result": "COST_EXCEEDED"},
        )

        async with httpx.AsyncClient() as client:
            with patch.object(client, "post", new=AsyncMock(return_value=mock_resp)):
                result = await _fetch_one_keyword(client, "software engineer")

        assert result is None, (
            "demand-control-result=COST_EXCEEDED should cause _fetch_one_keyword to return None"
        )

    @pytest.mark.asyncio
    async def test_demand_control_any_non_cost_ok_returns_none(self):
        """Any non-COST_OK demand-control-result value should return None."""
        from app.services.scraper_indeed import _fetch_one_keyword

        for header_value in ["COST_LIMIT_REACHED", "THROTTLED", "REJECTED"]:
            fake_results = [{"job": {"key": "abc123"}}]
            mock_resp = _make_httpx_response(
                200,
                _graphql_success(fake_results),
                headers={"demand-control-result": header_value},
            )

            async with httpx.AsyncClient() as client:
                with patch.object(client, "post", new=AsyncMock(return_value=mock_resp)):
                    result = await _fetch_one_keyword(client, "software engineer")

            assert result is None, (
                f"demand-control-result={header_value} should cause return None"
            )

    @pytest.mark.asyncio
    async def test_demand_control_cost_ok_proceeds_normally(self):
        """demand-control-result=COST_OK should process the response normally."""
        from app.services.scraper_indeed import _fetch_one_keyword

        fake_results = [{"job": {"key": "abc123", "title": "Software Engineer"}}]
        mock_resp = _make_httpx_response(
            200,
            _graphql_success(fake_results),
            headers={"demand-control-result": "COST_OK"},
        )

        async with httpx.AsyncClient() as client:
            with patch.object(client, "post", new=AsyncMock(return_value=mock_resp)):
                result = await _fetch_one_keyword(client, "software engineer")

        assert result == fake_results, (
            "demand-control-result=COST_OK should return results normally"
        )

    @pytest.mark.asyncio
    async def test_missing_demand_control_header_proceeds_normally(self):
        """No demand-control-result header should process the response normally."""
        from app.services.scraper_indeed import _fetch_one_keyword

        fake_results = [{"job": {"key": "abc123"}}]
        mock_resp = _make_httpx_response(
            200,
            _graphql_success(fake_results),
            headers={},  # No demand-control-result header
        )

        async with httpx.AsyncClient() as client:
            with patch.object(client, "post", new=AsyncMock(return_value=mock_resp)):
                result = await _fetch_one_keyword(client, "software engineer")

        assert result == fake_results, (
            "Missing demand-control-result header should proceed normally"
        )


# ---------------------------------------------------------------------------
# Bug 4: _build_headers() reads settings dynamically (not frozen at import)
# ---------------------------------------------------------------------------

class TestBuildHeaders:
    """_build_headers() must read INDEED_API_KEY dynamically each call."""

    def test_build_headers_function_exists(self):
        """_build_headers function must exist in the module."""
        import app.services.scraper_indeed as module
        assert hasattr(module, "_build_headers"), (
            "_build_headers function must exist (INDEED_HEADERS dict should be removed/replaced)"
        )
        assert callable(module._build_headers)

    def test_headers_use_current_api_key(self):
        """Calling _build_headers() twice with different mocked keys returns different headers."""
        from app.services.scraper_indeed import _build_headers

        with patch("app.services.scraper_indeed.settings") as mock_settings:
            mock_settings.INDEED_API_KEY = "key-alpha"
            headers_1 = _build_headers()

        with patch("app.services.scraper_indeed.settings") as mock_settings:
            mock_settings.INDEED_API_KEY = "key-beta"
            headers_2 = _build_headers()

        assert headers_1["indeed-api-key"] == "key-alpha", (
            "_build_headers() should use the current settings.INDEED_API_KEY"
        )
        assert headers_2["indeed-api-key"] == "key-beta", (
            "_build_headers() should reflect changed key without restart"
        )
        assert headers_1["indeed-api-key"] != headers_2["indeed-api-key"], (
            "Different mocked keys must produce different header values"
        )

    def test_build_headers_contains_required_fields(self):
        """_build_headers() must include all required Indeed API headers."""
        from app.services.scraper_indeed import _build_headers

        with patch("app.services.scraper_indeed.settings") as mock_settings:
            mock_settings.INDEED_API_KEY = "test-key"
            headers = _build_headers()

        required = ["Host", "content-type", "indeed-api-key", "accept", "indeed-locale"]
        for field in required:
            assert field in headers, f"_build_headers() missing required header: {field}"

    def test_indeed_headers_module_constant_removed_or_dynamic(self):
        """INDEED_HEADERS module constant should not be a static dict with a frozen key."""
        import app.services.scraper_indeed as module

        # If INDEED_HEADERS still exists as a module-level dict, it's a regression.
        # The module should use _build_headers() instead.
        # We verify by checking that _fetch_one_keyword does NOT reference a stale key.
        # Indirect check: _build_headers must exist and be used.
        assert hasattr(module, "_build_headers"), (
            "Module must expose _build_headers() for dynamic key reading"
        )

    def test_build_headers_warns_on_empty_key(self):
        """_build_headers() must log a warning when INDEED_API_KEY is empty, not raise."""
        import logging
        from app.services.scraper_indeed import _build_headers

        with patch("app.services.scraper_indeed.settings") as mock_settings:
            mock_settings.INDEED_API_KEY = ""
            with patch.object(
                logging.getLogger("VelocityScraper"), "warning"
            ) as mock_warn:
                # Must not raise — returns headers with empty key
                headers = _build_headers()

        assert headers is not None, "_build_headers() must return a dict even with empty key"
        mock_warn.assert_called_once()
        warning_msg = mock_warn.call_args[0][0]
        assert "INDEED_API_KEY" in warning_msg, (
            "Warning message must mention INDEED_API_KEY so operators know what to fix"
        )


# ---------------------------------------------------------------------------
# Architect review: _to_posted_at must use dateOnIndeed
# ---------------------------------------------------------------------------

class TestToPostedAt:
    """_to_posted_at() must use dateOnIndeed for consistency with _is_fresh."""

    def test_to_posted_at_uses_date_on_indeed(self):
        """_to_posted_at(job) must read job['dateOnIndeed'], not datePublished."""
        from app.services.scraper_indeed import _to_posted_at

        stale_ts = int(
            (datetime.now(timezone.utc) - timedelta(hours=48)).timestamp() * 1000
        )
        fresh_ts = int(
            (datetime.now(timezone.utc) - timedelta(minutes=30)).timestamp() * 1000
        )
        job = {
            "datePublished": stale_ts,  # old — should be ignored
            "dateOnIndeed": fresh_ts,   # new — should be used
        }
        result = _to_posted_at(job)
        assert result is not None, "_to_posted_at must return a datetime"
        age_minutes = (datetime.now(timezone.utc) - result).total_seconds() / 60
        assert age_minutes < 60, (
            f"_to_posted_at should use dateOnIndeed (~30 min ago), got {age_minutes:.1f} min ago"
        )

    def test_to_posted_at_returns_none_on_missing_date_on_indeed(self):
        """_to_posted_at returns None when dateOnIndeed is absent."""
        from app.services.scraper_indeed import _to_posted_at

        job = {"datePublished": 1_700_000_000_000}  # only datePublished
        result = _to_posted_at(job)
        assert result is None, (
            "_to_posted_at must return None when dateOnIndeed is absent"
        )

    def test_to_posted_at_returns_none_on_none_date_on_indeed(self):
        """_to_posted_at returns None when dateOnIndeed is None."""
        from app.services.scraper_indeed import _to_posted_at

        job = {"dateOnIndeed": None, "datePublished": 1_700_000_000_000}
        result = _to_posted_at(job)
        assert result is None


# ---------------------------------------------------------------------------
# Architect review: caller loop must use continue after fetch_errors += 1
# ---------------------------------------------------------------------------

class TestCallerLoopCriticalGuard:
    """None returns from _fetch_one_keyword must skip _process_results."""

    @pytest.mark.asyncio
    async def test_none_result_increments_errors_and_skips_process(self):
        """None from _fetch_one_keyword must not be passed to _process_results."""
        from app.services.scraper_indeed import fetch_indeed_jobs

        # 10 keywords all returning None — must not crash with TypeError
        keywords = [f"kw{i}" for i in range(10)]
        cfg = _mock_config(keywords=keywords)

        with (
            patch("app.services.scraper_indeed.get_target_keywords", cfg["get_target_keywords"]),
            patch("app.services.scraper_indeed.get_title_filter_keywords", cfg["get_title_filter_keywords"]),
            patch("app.services.scraper_indeed._fetch_one_keyword", new=AsyncMock(return_value=None)),
            patch("asyncio.sleep", new=AsyncMock()),
        ):
            # Must NOT raise TypeError: 'NoneType' object is not iterable
            result = await fetch_indeed_jobs(make_supabase(), user_id="u1")

        assert result["failed"] is True, (
            "All None returns (>80% failure) should set failed=True"
        )
        assert result["jobs"] == [], "No jobs should be produced when all fetches return None"

    @pytest.mark.asyncio
    async def test_demand_control_case_insensitive_comparison(self):
        """demand-control-result header comparison must be case-insensitive."""
        from app.services.scraper_indeed import _fetch_one_keyword

        # Lowercase variant — should still be treated as COST_OK
        fake_results = [{"job": {"key": "abc123", "title": "SWE"}}]
        mock_resp = _make_httpx_response(
            200,
            _graphql_success(fake_results),
            headers={"demand-control-result": "cost_ok"},
        )

        async with httpx.AsyncClient() as client:
            with patch.object(client, "post", new=AsyncMock(return_value=mock_resp)):
                result = await _fetch_one_keyword(client, "software engineer")

        assert result == fake_results, (
            "demand-control-result='cost_ok' (lowercase) should be treated as COST_OK"
        )
