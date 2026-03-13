"""
User settings (target keywords, blocked companies, etc.) backed by Supabase.
Replaces redis_config.py entirely.

Includes an in-memory cache with instant invalidation on writes
so scraper loops never wait on network for config reads.
"""

import asyncio
import json
import logging
import time
from typing import Any

logger = logging.getLogger("SupabaseConfig")

# In-memory cache: { "user_id:key" -> (value, timestamp) }
_cache: dict[str, tuple[list, float]] = {}
_CACHE_TTL = 120  # seconds — fallback max age; writes invalidate instantly


DEFAULT_TARGET_KEYWORDS = [
    "Software Engineer",
    "Backend Engineer",
    "Full Stack Engineer",
    "Data Engineer",
    "ML Engineer",
    "Platform Engineer",
    "DevOps Engineer",
    "Cloud Engineer",
    "Site Reliability Engineer",
    "Infrastructure Engineer",
]

DEFAULT_TARGET_LOCATIONS = ["United States"]

DEFAULT_BLOCKED_COMPANIES: list[str] = []

DEFAULT_TITLE_FILTER_KEYWORDS = [
    "Senior", "Sr.", "Sr ", "Staff", "Staff+", "Principal",
    "Director", "Lead", "Manager", "Head of",
    "VP", "Vice President", "Chief", "Distinguished", "Fellow",
    "Architect", "CTO", "CEO", "CFO", "COO",
    "President", "Executive", "Partner", "Founding", "Co-Founder",
    "Intern", "Internship", "Co-op", "Coop", "Apprentice",
    "Trainee", "Junior Intern", "Summer Intern", "Winter Intern",
    "PhD", "Postdoc", "Postdoctoral", "Research Scientist",
    "Clinical", "Nurse", "Physician", "Doctor", "Medical",
    "Dental", "Pharmacist", "Veterinarian",
]

VALID_KEYS = ["target_keywords", "target_locations", "blocked_companies", "title_filter_keywords", "location_filter_location"]

DEFAULTS = {
    "target_keywords": DEFAULT_TARGET_KEYWORDS,
    "target_locations": DEFAULT_TARGET_LOCATIONS,
    "blocked_companies": DEFAULT_BLOCKED_COMPANIES,
    "title_filter_keywords": DEFAULT_TITLE_FILTER_KEYWORDS,
    "location_filter_location": [],
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _cache_key(user_id: str, key: str) -> str:
    return f"{user_id}:{key}"


async def _get_setting(supabase: Any, user_id: str, key: str) -> list:
    """Read a single setting from Supabase, using cache when possible."""
    ck = _cache_key(user_id, key)
    cached = _cache.get(ck)
    if cached:
        val, ts = cached
        if time.time() - ts < _CACHE_TTL:
            return val

    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("user_settings")
            .select(key)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if resp.data:
            val = resp.data[0].get(key)
            if isinstance(val, str):
                val = json.loads(val)
            result = val if isinstance(val, list) else DEFAULTS.get(key, [])
        else:
            result = DEFAULTS.get(key, [])

        _cache[ck] = (result, time.time())
        return result
    except Exception as e:
        logger.warning(f"Failed to get setting '{key}' for {user_id}: {e}")
        return DEFAULTS.get(key, [])


async def _set_setting(supabase: Any, user_id: str, key: str, value: list) -> bool:
    """Write a setting and immediately invalidate the cache."""
    try:
        await asyncio.to_thread(
            lambda: supabase.table("user_settings")
            .update({key: json.dumps(value)})
            .eq("user_id", user_id)
            .execute()
        )
        # Instant cache invalidation
        ck = _cache_key(user_id, key)
        _cache[ck] = (value, time.time())
        return True
    except Exception as e:
        logger.error(f"Failed to set setting '{key}' for {user_id}: {e}")
        return False


# ---------------------------------------------------------------------------
# Public API — drop-in replacements for redis_config functions
# ---------------------------------------------------------------------------

async def get_target_keywords(supabase: Any, user_id: str) -> list[str]:
    return await _get_setting(supabase, user_id, "target_keywords")


async def get_target_locations(supabase: Any, user_id: str) -> list[str]:
    return await _get_setting(supabase, user_id, "target_locations")


async def get_blocked_companies(supabase: Any, user_id: str) -> list[str]:
    return await _get_setting(supabase, user_id, "blocked_companies")


async def get_title_filter_keywords(supabase: Any, user_id: str) -> list[str]:
    return await _get_setting(supabase, user_id, "title_filter_keywords")


async def set_config_list(supabase: Any, user_id: str, key: str, value: list) -> bool:
    if key not in VALID_KEYS:
        logger.error(f"Invalid config key: {key}")
        return False
    return await _set_setting(supabase, user_id, key, value)


async def get_all_config(supabase: Any, user_id: str) -> dict:
    return {
        "target_keywords": await get_target_keywords(supabase, user_id),
        "target_locations": await get_target_locations(supabase, user_id),
        "blocked_companies": await get_blocked_companies(supabase, user_id),
        "title_filter_keywords": await get_title_filter_keywords(supabase, user_id),
    }


async def get_location_filter(supabase: Any, user_id: str) -> str | None:
    """Get the user's location filter value (e.g. 'MA', 'California')."""
    vals = await _get_setting(supabase, user_id, "location_filter_location")
    return vals[0] if vals else None


async def set_location_filter(supabase: Any, user_id: str, value: str | None) -> bool:
    """Set the user's location filter. Pass None to clear."""
    return await _set_setting(supabase, user_id, "location_filter_location", [value] if value else [])


async def seed_settings_if_missing(supabase: Any, user_id: str) -> None:
    """Insert default settings row if user doesn't have one yet."""
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("user_settings")
            .select("user_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not resp.data:
            await asyncio.to_thread(
                lambda: supabase.table("user_settings")
                .insert({"user_id": user_id})
                .execute()
            )
            logger.info(f"Seeded default settings for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to seed settings for {user_id}: {e}")
