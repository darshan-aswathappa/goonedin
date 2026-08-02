"""
Tests for Greenhouse location matching (substring + US-state normalize).
"""
import pytest

from app.services.greenhouse_match import location_matches


@pytest.mark.parametrize(
    "location_raw, targets",
    [
        ("San Francisco, CA", ["California"]),        # city, state → full state name
        ("San Francisco, CA", ["United States"]),     # US state → country target
        ("New York, NY; Remote", ["Remote"]),         # remote piece
        ("Remote - US", ["United States"]),           # remote-US → country
        ("Boston", ["Boston"]),                        # direct substring
        ("Austin, TX; Chicago, IL", ["Illinois"]),    # second piece matches
        ("United States", ["USA"]),                    # country alias
        ("San Francisco, CA", ["ca"]),                 # abbreviation target
    ],
)
def test_matches(location_raw: str, targets: list[str]) -> None:
    assert location_matches(location_raw, targets) is True


@pytest.mark.parametrize(
    "location_raw, targets",
    [
        ("Europe; Poland; Ukraine", ["United States"]),
        ("London, UK", ["United States"]),
        ("Berlin, Germany", ["California"]),
        ("Toronto, Canada", ["New York"]),
    ],
)
def test_non_matches(location_raw: str, targets: list[str]) -> None:
    assert location_matches(location_raw, targets) is False


def test_empty_targets_allows_all() -> None:
    assert location_matches("Anywhere", []) is True


def test_empty_location_rejected() -> None:
    assert location_matches("", ["United States"]) is False
