"""Shared title blacklist matching.

Every scraper and the /jobs read path go through `is_title_blocked` so the
matching semantics stay identical everywhere. Keeping this in one place is
deliberate: the scrapers previously each inlined their own comparison and two
of them forgot to lowercase the keyword, silently disabling the whole filter.
"""


def is_title_blocked(title: str, keywords: list[str]) -> bool:
    """True if `title` contains any blacklist keyword.

    Matching is case-insensitive substring, so "Senior" blocks
    "senior software engineer" and "SENIOR ENGINEER" alike.
    """
    if not title or not keywords:
        return False
    lowered = title.lower()
    return any(kw.lower() in lowered for kw in keywords if kw)
