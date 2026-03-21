"""
Tests for ISSUE-001: Global Keywords migration.
TDD - written before implementation.
"""
import asyncio
import time
import pytest
from unittest.mock import MagicMock, patch, AsyncMock


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def make_supabase(rows=None):
    """Return a lightweight supabase stub whose table().select()... chain works."""
    sb = MagicMock()
    resp = MagicMock()
    resp.data = rows if rows is not None else []

    # Build a fluent chain: table().select().eq().limit().execute()
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.limit.return_value = chain
    chain.execute.return_value = resp
    chain.insert.return_value = chain
    chain.update.return_value = chain
    chain.upsert.return_value = chain
    chain.delete.return_value = chain

    sb.table.return_value = chain
    return sb, chain, resp


# ---------------------------------------------------------------------------
# supabase_config: get_target_keywords
# ---------------------------------------------------------------------------

class TestGetTargetKeywords:
    """get_target_keywords now reads from global_keywords, ignores user_id."""

    @pytest.mark.asyncio
    async def test_returns_active_keywords_from_global_table(self):
        from app.core.supabase_config import get_target_keywords, _cache

        rows = [
            {"keyword": "Software Engineer"},
            {"keyword": "Backend Engineer"},
            {"keyword": "ML Engineer"},
        ]
        sb, chain, resp = make_supabase(rows)
        resp.data = rows

        # Clear cache to force DB read
        _cache.pop("global:target_keywords", None)

        with patch("asyncio.to_thread", new=AsyncMock(return_value=resp)):
            result = await get_target_keywords(sb, user_id="any-user-id")

        assert result == ["Software Engineer", "Backend Engineer", "ML Engineer"]

    @pytest.mark.asyncio
    async def test_ignores_user_id_parameter(self):
        """Calling with different user_ids must return the same global list."""
        from app.core.supabase_config import get_target_keywords, _cache
        _cache.pop("global:target_keywords", None)

        rows = [{"keyword": "Platform Engineer"}]
        sb, chain, resp = make_supabase(rows)
        resp.data = rows

        with patch("asyncio.to_thread", new=AsyncMock(return_value=resp)):
            result_u1 = await get_target_keywords(sb, user_id="user-111")

        _cache.pop("global:target_keywords", None)

        with patch("asyncio.to_thread", new=AsyncMock(return_value=resp)):
            result_u2 = await get_target_keywords(sb, user_id="user-222")

        assert result_u1 == result_u2

    @pytest.mark.asyncio
    async def test_uses_global_cache_key(self):
        """After first call, result is served from cache keyed as 'global:target_keywords'."""
        from app.core.supabase_config import get_target_keywords, _cache

        rows = [{"keyword": "DevOps Engineer"}]
        sb, chain, resp = make_supabase(rows)
        resp.data = rows
        _cache.pop("global:target_keywords", None)

        call_count = 0

        async def fake_to_thread(fn, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            return resp

        with patch("asyncio.to_thread", new=fake_to_thread):
            await get_target_keywords(sb, "u1")
            await get_target_keywords(sb, "u2")  # should hit cache, not DB

        assert call_count == 1, "Second call should be served from cache"
        assert "global:target_keywords" in _cache

    @pytest.mark.asyncio
    async def test_returns_empty_list_on_db_error(self):
        from app.core.supabase_config import get_target_keywords, _cache
        _cache.pop("global:target_keywords", None)

        sb = MagicMock()

        async def exploding_thread(fn, *args, **kwargs):
            raise Exception("DB unavailable")

        with patch("asyncio.to_thread", new=exploding_thread):
            result = await get_target_keywords(sb, "user-x")

        assert result == []


# ---------------------------------------------------------------------------
# supabase_config: target_keywords removed from VALID_KEYS / DEFAULTS
# ---------------------------------------------------------------------------

class TestConfigConstants:
    def test_target_keywords_not_in_valid_keys(self):
        from app.core.supabase_config import VALID_KEYS
        assert "target_keywords" not in VALID_KEYS

    def test_target_keywords_not_in_defaults(self):
        from app.core.supabase_config import DEFAULTS
        assert "target_keywords" not in DEFAULTS

    def test_get_all_config_excludes_target_keywords(self):
        """get_all_config() should not surface target_keywords as a user-editable field."""
        import inspect
        from app.core import supabase_config
        import ast, textwrap

        src = inspect.getsource(supabase_config.get_all_config)
        # The function must not reference "target_keywords" in its return dict
        assert '"target_keywords"' not in src, (
            "get_all_config() must not include target_keywords in its return dict"
        )


# ---------------------------------------------------------------------------
# supabase_config: seed_settings_if_missing no longer seeds target_keywords
# ---------------------------------------------------------------------------

class TestSeedSettings:
    @pytest.mark.asyncio
    async def test_seed_does_not_insert_target_keywords(self):
        from app.core.supabase_config import seed_settings_if_missing

        sb, chain, resp = make_supabase([])  # no row → triggers insert
        resp.data = []

        captured_inserts = []

        async def fake_to_thread(fn, *args, **kwargs):
            result = fn()
            # Capture what was inserted
            if hasattr(chain, "_mock_call_args_list"):
                for call in chain.insert.call_args_list:
                    captured_inserts.append(call)
            return resp

        with patch("asyncio.to_thread", new=fake_to_thread):
            await seed_settings_if_missing(sb, "new-user")

        # Check no insert contained 'target_keywords'
        for call in captured_inserts:
            args, kwargs = call
            if args:
                payload = args[0]
                assert "target_keywords" not in payload, (
                    "seed_settings_if_missing must not seed target_keywords"
                )


# ---------------------------------------------------------------------------
# Admin keywords helpers (new module: global_keywords.py)
# ---------------------------------------------------------------------------

class TestAdminKeywordsHelpers:
    """Test the data-access helpers that manage global_keywords table."""

    @pytest.mark.asyncio
    async def test_list_global_keywords_returns_all_rows(self):
        from app.core.global_keywords import list_global_keywords

        rows = [
            {"id": "abc", "keyword": "Software Engineer", "active": True},
            {"id": "def", "keyword": "ML Engineer", "active": False},
        ]
        sb, chain, resp = make_supabase(rows)

        with patch("asyncio.to_thread", new=AsyncMock(return_value=resp)):
            result = await list_global_keywords(sb)

        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_add_keyword_inserts_row(self):
        from app.core.global_keywords import add_keyword

        inserted_row = {"id": "xyz", "keyword": "Cloud Engineer", "active": True}
        sb, chain, resp = make_supabase([inserted_row])

        with patch("asyncio.to_thread", new=AsyncMock(return_value=resp)):
            result = await add_keyword(sb, "Cloud Engineer")

        assert result["keyword"] == "Cloud Engineer"

    @pytest.mark.asyncio
    async def test_toggle_keyword_active_flag(self):
        from app.core.global_keywords import toggle_keyword

        updated_row = {"id": "abc", "keyword": "DevOps Engineer", "active": False}
        sb, chain, resp = make_supabase([updated_row])

        with patch("asyncio.to_thread", new=AsyncMock(return_value=resp)):
            result = await toggle_keyword(sb, keyword_id="abc", active=False)

        assert result["active"] is False

    @pytest.mark.asyncio
    async def test_delete_keyword_removes_row(self):
        from app.core.global_keywords import delete_keyword

        sb, chain, resp = make_supabase([])

        with patch("asyncio.to_thread", new=AsyncMock(return_value=resp)):
            await delete_keyword(sb, keyword_id="abc")  # should not raise

    @pytest.mark.asyncio
    async def test_add_keyword_invalidates_global_cache(self):
        from app.core import supabase_config, global_keywords

        supabase_config._cache["global:target_keywords"] = (["old"], time.time())

        sb, chain, resp = make_supabase([{"id": "1", "keyword": "New Keyword", "active": True}])

        with patch("asyncio.to_thread", new=AsyncMock(return_value=resp)):
            await global_keywords.add_keyword(sb, "New Keyword")

        assert "global:target_keywords" not in supabase_config._cache

    @pytest.mark.asyncio
    async def test_toggle_keyword_invalidates_global_cache(self):
        from app.core import supabase_config, global_keywords

        supabase_config._cache["global:target_keywords"] = (["old"], time.time())

        sb, chain, resp = make_supabase([{"id": "1", "keyword": "X", "active": False}])

        with patch("asyncio.to_thread", new=AsyncMock(return_value=resp)):
            await global_keywords.toggle_keyword(sb, "1", False)

        assert "global:target_keywords" not in supabase_config._cache

    @pytest.mark.asyncio
    async def test_delete_keyword_invalidates_global_cache(self):
        from app.core import supabase_config, global_keywords

        supabase_config._cache["global:target_keywords"] = (["old"], time.time())

        sb, chain, resp = make_supabase([])

        with patch("asyncio.to_thread", new=AsyncMock(return_value=resp)):
            await global_keywords.delete_keyword(sb, "1")

        assert "global:target_keywords" not in supabase_config._cache


# ---------------------------------------------------------------------------
# Cache TTL: global cache respects _CACHE_TTL
# ---------------------------------------------------------------------------

class TestGlobalCacheTTL:
    @pytest.mark.asyncio
    async def test_expired_global_cache_triggers_db_read(self):
        from app.core.supabase_config import get_target_keywords, _cache, _CACHE_TTL

        # Force stale cache entry
        _cache["global:target_keywords"] = (["stale"], time.time() - _CACHE_TTL - 1)

        rows = [{"keyword": "Fresh Keyword"}]
        sb, chain, resp = make_supabase(rows)
        resp.data = rows

        with patch("asyncio.to_thread", new=AsyncMock(return_value=resp)):
            result = await get_target_keywords(sb, "any-user")

        assert result == ["Fresh Keyword"]
