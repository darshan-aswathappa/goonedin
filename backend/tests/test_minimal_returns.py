"""Writes must not ask PostgREST to echo rows back (Free-plan egress), while
callers still learn whether anything was inserted/deleted via the count."""

import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock

from postgrest import CountMethod, ReturnMethod

from app.services import supabase_jobs
from app.services.greenhouse_jobs import get_known_ids


def _client(count=None, data=None):
    supabase = MagicMock()
    builder = MagicMock()
    builder.execute.return_value = SimpleNamespace(count=count, data=data or [])
    for name in ("upsert", "update", "delete", "select", "eq", "lt", "in_", "not_", "is_", "limit"):
        getattr(builder, name).return_value = builder
    builder.not_ = builder
    supabase.table.return_value = builder
    supabase.rpc.return_value = builder
    return supabase, builder


def _job():
    return {"source": "LinkedIn", "external_id": "1", "title": "SWE"}


def test_insert_job_if_new_returns_row_when_inserted():
    supabase, builder = _client(count=1)
    row = asyncio.run(supabase_jobs.insert_job_if_new(supabase, "u", _job()))
    assert row is not None and row["external_id"] == "1"
    kwargs = builder.upsert.call_args.kwargs
    assert kwargs["returning"] == ReturnMethod.minimal
    assert kwargs["count"] == CountMethod.exact
    assert kwargs["ignore_duplicates"] is True


def test_insert_job_if_new_returns_none_for_duplicate():
    supabase, _ = _client(count=0)
    assert asyncio.run(supabase_jobs.insert_job_if_new(supabase, "u", _job())) is None


def test_upsert_job_returns_input_row_without_echo():
    supabase, builder = _client()
    row = asyncio.run(supabase_jobs.upsert_job(supabase, "u", _job()))
    assert row["user_id"] == "u"
    assert builder.upsert.call_args.kwargs["returning"] == ReturnMethod.minimal


def test_cleanup_old_invisible_jobs_counts_without_rows():
    supabase, builder = _client(count=42)
    assert asyncio.run(supabase_jobs.cleanup_old_invisible_jobs(supabase)) == 42
    assert builder.delete.call_args.kwargs == {
        "returning": ReturnMethod.minimal,
        "count": CountMethod.exact,
    }


def test_cleanup_expired_jobs_counts_without_rows():
    supabase, builder = _client(count=3)
    assert asyncio.run(supabase_jobs.cleanup_expired_jobs(supabase)) == 3
    assert builder.update.call_args.kwargs["returning"] == ReturnMethod.minimal


def test_run_retention_calls_rpc():
    supabase, _ = _client(data={"queue": 1, "greenhouse": 0, "cache": 0})
    assert asyncio.run(supabase_jobs.run_retention(supabase)) == {"queue": 1, "greenhouse": 0, "cache": 0}
    supabase.rpc.assert_called_once_with("run_retention")


def test_get_known_ids_returns_existing_ids():
    supabase, builder = _client(data=[{"external_id": 5}, {"external_id": "7"}])
    assert asyncio.run(get_known_ids(supabase, [5, 6, 7])) == {5, 7}
    builder.in_.assert_called_once_with("external_id", [5, 6, 7])


def test_get_known_ids_skips_query_for_empty_list():
    supabase, _ = _client()
    assert asyncio.run(get_known_ids(supabase, [])) == set()
    supabase.table.assert_not_called()
