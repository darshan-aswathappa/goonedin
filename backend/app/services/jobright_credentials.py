"""
Per-user Jobright credential storage and retrieval.

Credentials are encrypted with AES-256-GCM (app/core/crypto.py) before being
written to the database.  The database columns (jobright_email_enc,
jobright_password_enc) store opaque ciphertext — never plaintext.

The in-memory cache holds decrypted values for up to _CACHE_TTL seconds so the
scraper does not hit the database on every login attempt.  Cache entries are
evicted immediately on credential update or delete.
"""

import asyncio
import logging
import time
from typing import Any, Optional, TypedDict

from app.core.crypto import decrypt_field, encrypt_field

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
    """Return decrypted credentials for user, or None if not configured."""
    cached = _cred_cache.get(user_id)
    if cached:
        email, password, ts = cached
        if time.time() - ts < _CACHE_TTL:
            return {"email": email, "password": password} if email and password else None

    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("user_settings")
            .select("jobright_email_enc, jobright_password_enc")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not resp.data:
            return None

        row = resp.data[0]
        enc_email = row.get("jobright_email_enc") or ""
        enc_password = row.get("jobright_password_enc") or ""

        if not enc_email or not enc_password:
            return None

        try:
            email = decrypt_field(enc_email)
            password = decrypt_field(enc_password)
        except ValueError as e:
            logger.error(f"Failed to decrypt Jobright credentials for {user_id}: {e}")
            return None

        _cred_cache[user_id] = (email, password, time.time())
        return {"email": email, "password": password}

    except Exception as e:
        logger.error(f"Failed to fetch Jobright credentials for {user_id}: {e}")
        return None


async def set_jobright_credentials(
    supabase: Any, user_id: str, email: str, password: str
) -> bool:
    """Encrypt and persist credentials, then update the cache."""
    try:
        enc_email = encrypt_field(email)
        enc_password = encrypt_field(password)
    except RuntimeError as e:
        logger.error(f"Encryption unavailable — is CREDENTIAL_ENCRYPTION_KEY set? {e}")
        return False

    try:
        await asyncio.to_thread(
            lambda: supabase.table("user_settings")
            .update(
                {
                    "jobright_email_enc": enc_email,
                    "jobright_password_enc": enc_password,
                }
            )
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
            .update(
                {
                    "jobright_email_enc": None,
                    "jobright_password_enc": None,
                }
            )
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
