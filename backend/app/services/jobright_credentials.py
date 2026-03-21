"""
Per-user Jobright credential storage and retrieval.
Follows the _get_setting/_set_setting pattern from supabase_config.py.
"""
import asyncio
import logging
import time
from typing import Optional, Any, TypedDict

logger = logging.getLogger("JobrightCredentials")

_CACHE_TTL = 300  # 5 minutes


class JobrightCreds(TypedDict):
    email: str
    password: str


# In-memory cache: { user_id -> (email, password, timestamp) }
_cred_cache: dict[str, tuple[str, str, float]] = {}


async def get_jobright_credentials(
    supabase: Any, user_id: str
) -> Optional[JobrightCreds]:
    """Return credentials for user, or None if not configured."""
    cached = _cred_cache.get(user_id)
    if cached:
        email, password, ts = cached
        if time.time() - ts < _CACHE_TTL:
            return {"email": email, "password": password} if email and password else None

    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("user_settings")
            .select("jobright_email, jobright_password")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if resp.data:
            row = resp.data[0]
            email = row.get("jobright_email") or ""
            password = row.get("jobright_password") or ""
            _cred_cache[user_id] = (email, password, time.time())
            return {"email": email, "password": password} if email and password else None
        return None
    except Exception as e:
        logger.error(f"Failed to fetch Jobright credentials for {user_id}: {e}")
        return None


async def set_jobright_credentials(
    supabase: Any, user_id: str, email: str, password: str
) -> bool:
    """Persist credentials and immediately invalidate cache."""
    try:
        await asyncio.to_thread(
            lambda: supabase.table("user_settings")
            .update({"jobright_email": email, "jobright_password": password})
            .eq("user_id", user_id)
            .execute()
        )
        _cred_cache[user_id] = (email, password, time.time())
        return True
    except Exception as e:
        logger.error(f"Failed to save Jobright credentials for {user_id}: {e}")
        return False


async def clear_jobright_credentials(supabase: Any, user_id: str) -> bool:
    """Remove credentials (user disconnects Jobright)."""
    try:
        await asyncio.to_thread(
            lambda: supabase.table("user_settings")
            .update({"jobright_email": None, "jobright_password": None})
            .eq("user_id", user_id)
            .execute()
        )
        _cred_cache.pop(user_id, None)
        return True
    except Exception as e:
        logger.error(f"Failed to clear Jobright credentials for {user_id}: {e}")
        return False


def invalidate_credentials_cache(user_id: str) -> None:
    """Remove cached credentials (called after permanent auth failure)."""
    _cred_cache.pop(user_id, None)
