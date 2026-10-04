import asyncio
from unittest.mock import MagicMock

from app.services.greenhouse_boards import crawled_row, failed_row, save_crawl_results

ROW_KEYS = {"slug", "status", "company_name", "last_crawled_at", "consecutive_failures", "updated_at"}


def test_crawled_row_resets_failures_and_keeps_known_company():
    board = {"slug": "acme", "company_name": "Acme", "consecutive_failures": 2}
    row = crawled_row(board)
    assert set(row) == ROW_KEYS
    assert row["status"] == "live"
    assert row["consecutive_failures"] == 0
    assert row["company_name"] == "Acme"


def test_crawled_row_prefers_discovered_company_name():
    row = crawled_row({"slug": "acme", "company_name": None}, "Acme Inc")
    assert row["company_name"] == "Acme Inc"


def test_failed_row_increments_and_stays_live_below_threshold():
    row = failed_row({"slug": "acme", "consecutive_failures": None}, max_failures=3)
    assert set(row) == ROW_KEYS
    assert row["consecutive_failures"] == 1
    assert row["status"] == "live"


def test_failed_row_marks_dead_at_threshold():
    row = failed_row({"slug": "acme", "consecutive_failures": 2}, max_failures=3)
    assert row["consecutive_failures"] == 3
    assert row["status"] == "dead"


def test_save_crawl_results_sends_one_upsert():
    supabase = MagicMock()
    rows = [crawled_row({"slug": "a"}), failed_row({"slug": "b"}, 3)]
    asyncio.run(save_crawl_results(supabase, rows))
    supabase.table.assert_called_once_with("greenhouse_boards")
    supabase.table.return_value.upsert.assert_called_once_with(rows, on_conflict="slug")


def test_save_crawl_results_skips_empty_round():
    supabase = MagicMock()
    asyncio.run(save_crawl_results(supabase, []))
    supabase.table.assert_not_called()
