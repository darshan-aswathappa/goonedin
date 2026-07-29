"""
Tests for the shared title blacklist matcher.

Regression guard for the bug where scrapers compared a capitalized keyword
against an already-lowercased title ("Senior" in "senior engineer" -> False),
which silently disabled the entire title filter on LinkedIn and GitHub.
"""
import pytest

from app.core.title_filter import is_title_blocked


DEFAULT_KEYWORDS = ["Senior", "Sr.", "Staff", "Principal", "Director"]


@pytest.mark.parametrize(
    "title",
    [
        "Senior Software Engineer",   # keyword case matches title case
        "senior software engineer",   # title lowercase, keyword capitalized
        "SENIOR SOFTWARE ENGINEER",   # title uppercase
        "sEnIoR Software Engineer",   # mixed case
        "Staff Engineer",
        "Principal Architect",
    ],
)
def test_blocks_regardless_of_case(title: str) -> None:
    assert is_title_blocked(title, DEFAULT_KEYWORDS) is True


@pytest.mark.parametrize(
    "title",
    [
        "Software Engineer",
        "New Grad Software Engineer",
        "Backend Engineer I",
    ],
)
def test_allows_non_matching_titles(title: str) -> None:
    assert is_title_blocked(title, DEFAULT_KEYWORDS) is False


def test_lowercase_keyword_blocks_capitalized_title() -> None:
    """A user typing 'senior' in the UI must still block 'Senior Engineer'."""
    assert is_title_blocked("Senior Engineer", ["senior"]) is True


def test_empty_keywords_blocks_nothing() -> None:
    assert is_title_blocked("Senior Engineer", []) is False


def test_empty_title_is_not_blocked() -> None:
    assert is_title_blocked("", DEFAULT_KEYWORDS) is False


def test_blank_keyword_does_not_match_everything() -> None:
    """An empty string is a substring of every title — it must be skipped."""
    assert is_title_blocked("Software Engineer", ["", "Senior"]) is False
