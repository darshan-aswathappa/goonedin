"""
Per-user matching helpers for the Greenhouse pool.

Greenhouse `location.name` is free-form and often multi-valued, e.g.
"Europe; Poland; Ukraine" or "San Francisco, CA; Remote". We split on ';',
then match each piece against the user's target_locations using substring plus
the shared US-state normalizer (normalize_location). Keyword / title-block /
blocked-company filtering reuses the same helpers as LinkedIn and happens in
the loop that calls process_and_alert_jobs.
"""

import re

from app.core.location_map import normalize_location

# Country-level aliases that should match any US location (incl. any US state).
US_COUNTRY_ALIASES = {
    "united states", "united states of america", "usa", "us",
    "u.s.", "u.s.a.", "america", "united states (remote)",
}

# Markers that signal a US location inside a free-text piece.
_US_MARKERS = ("united states", "usa", "u.s.a", "u.s.", "us-remote", "remote - us")


def _split_pieces(location_raw: str) -> list[str]:
    """Split a raw location into candidate pieces on ';', '|' and '/'."""
    return [p.strip() for p in re.split(r"[;|/]", location_raw) if p.strip()]


def _piece_is_us(piece: str) -> bool:
    """True if a location piece resolves to (or is marked as) US."""
    low = piece.lower()
    if any(m in low for m in _US_MARKERS):
        return True
    # Whole piece or a comma-token normalizes to a US state.
    if normalize_location(piece):
        return True
    for token in (t.strip() for t in piece.split(",")):
        if token and normalize_location(token):
            return True
    return False


def _piece_matches_target(piece: str, target: str) -> bool:
    """Match a single location piece against a single target_location."""
    pl = piece.lower()
    tl = target.lower().strip()
    if not tl:
        return False

    # Remote is broadly acceptable.
    if "remote" in pl and ("remote" in tl or tl in US_COUNTRY_ALIASES):
        return True

    # Direct substring either direction ("Boston" vs "Boston, MA").
    if tl in pl or pl in tl:
        return True

    # Country-level target → any US piece qualifies.
    if tl in US_COUNTRY_ALIASES and _piece_is_us(piece):
        return True

    # Normalized US-state matching (handles "San Francisco, CA" vs "California").
    target_entry = normalize_location(target)
    if target_entry:
        if target_entry["full_name"].lower() in pl:
            return True
        if any(pat.lower() in pl for pat in target_entry["state_patterns"]):
            return True
        if any(city.lower() in pl for city in target_entry["cities"]):
            return True
        # Piece (whole or comma-token) resolves to the same state.
        candidates = [piece] + [t.strip() for t in piece.split(",")]
        for cand in candidates:
            entry = normalize_location(cand)
            if entry and entry["abbreviation"] == target_entry["abbreviation"]:
                return True

    return False


def location_matches(location_raw: str, target_locations: list[str]) -> bool:
    """True if any piece of `location_raw` satisfies any target location.

    Empty target_locations → no location filter (allow). Empty location → reject.
    """
    if not location_raw:
        return False
    if not target_locations:
        return True

    for piece in _split_pieces(location_raw):
        for target in target_locations:
            if _piece_matches_target(piece, target):
                return True
    return False
