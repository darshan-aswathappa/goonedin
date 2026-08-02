"""
Unit tests for the Greenhouse fetch/parse primitives.

Built around a captured appflame payload shape so the parsing, freshness
window, relevance gate, and HTML-entity content cleaning stay pinned.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.scraper_greenhouse import (
    ParsedJob,
    clean_content,
    is_fresh,
    is_globally_relevant,
    parse_job,
)

NOW = datetime(2026, 7, 24, 12, 0, 0, tzinfo=timezone.utc)


def _raw(**overrides) -> dict:
    base = {
        "id": 4929889101,
        "title": "Creative Producer",
        "location": {"name": "Europe; Poland; Ukraine"},
        "first_published": "2026-07-23T07:18:49-04:00",
        "updated_at": "2026-07-23T07:18:49-04:00",
        "company_name": "appflame",
        "absolute_url": "https://job-boards.eu.greenhouse.io/appflame/jobs/4929889101",
    }
    base.update(overrides)
    return base


class TestParseJob:
    def test_parses_core_fields(self) -> None:
        job = parse_job(_raw(), "appflame")
        assert job is not None
        assert job.external_id == 4929889101
        assert job.title == "Creative Producer"
        assert job.company_name == "appflame"
        assert job.location_raw == "Europe; Poland; Ukraine"
        assert job.first_published == datetime(2026, 7, 23, 7, 18, 49, tzinfo=timezone(timedelta(hours=-4)))

    def test_missing_id_or_title_rejected(self) -> None:
        assert parse_job(_raw(id=None), "appflame") is None
        assert parse_job(_raw(title=""), "appflame") is None

    def test_missing_url_rejected(self) -> None:
        assert parse_job(_raw(absolute_url=""), "appflame") is None

    def test_company_falls_back_to_slug(self) -> None:
        job = parse_job(_raw(company_name=None), "appflame")
        assert job is not None and job.company_name == "appflame"


class TestFreshness:
    def _job(self, first_published: str | None, updated_at: str | None = None) -> ParsedJob:
        raw = _raw(first_published=first_published, updated_at=updated_at or first_published)
        job = parse_job(raw, "appflame")
        assert job is not None
        return job

    def test_recent_is_fresh(self) -> None:
        job = self._job("2026-07-23T07:18:49-04:00")  # ~29h before NOW
        assert is_fresh(job, freshness_hours=48, now=NOW) is True

    def test_old_is_not_fresh(self) -> None:
        job = self._job("2026-07-01T00:00:00-04:00")
        assert is_fresh(job, freshness_hours=48, now=NOW) is False

    def test_falls_back_to_updated_at(self) -> None:
        job = self._job(first_published=None, updated_at="2026-07-23T07:18:49-04:00")
        assert is_fresh(job, freshness_hours=48, now=NOW) is True

    def test_no_timestamps_not_fresh(self) -> None:
        job = self._job(first_published=None, updated_at=None)
        assert is_fresh(job, freshness_hours=48, now=NOW) is False


class TestGlobalRelevance:
    def test_matches_keyword(self) -> None:
        assert is_globally_relevant("Software Engineer", ["engineer"], []) is True

    def test_no_keyword_match(self) -> None:
        assert is_globally_relevant("Creative Producer", ["engineer"], []) is False

    def test_blocklist_wins(self) -> None:
        assert is_globally_relevant("Senior Engineer", ["engineer"], ["senior"]) is False

    def test_empty_keywords_matches_all(self) -> None:
        assert is_globally_relevant("Anything", [], []) is True


class TestCleanContent:
    def test_unescapes_and_strips_html(self) -> None:
        raw = "&lt;div&gt;&lt;p&gt;&lt;strong&gt;appflame&lt;/strong&gt; builds apps&lt;/p&gt;&lt;/div&gt;"
        # separator="\n" joins adjacent text nodes with newlines (matches the
        # Indeed description handler); tags are gone and entities unescaped.
        cleaned = clean_content(raw)
        assert "<" not in cleaned and "&lt;" not in cleaned
        assert "appflame" in cleaned and "builds apps" in cleaned

    def test_empty(self) -> None:
        assert clean_content(None) == ""
        assert clean_content("") == ""

    def test_truncates(self) -> None:
        raw = "&lt;p&gt;" + ("x" * 20000) + "&lt;/p&gt;"
        assert len(clean_content(raw)) <= 8000
