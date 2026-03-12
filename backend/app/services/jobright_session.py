"""
Jobright.ai Session Manager — auto-login via curl_cffi.

Handles authentication by POSTing email/password to /swan/auth/login/pwd,
extracts SESSION_ID from the Set-Cookie header, caches it, and auto-refreshes
when the session expires or becomes invalid.
"""

import asyncio
import logging
import time
from typing import Optional

from curl_cffi.requests import AsyncSession

from app.core.config import get_settings

logger = logging.getLogger("JobrightSession")
settings = get_settings()

LOGIN_URL = "https://jobright.ai/swan/auth/login/pwd"

# Re-login proactively every 50 minutes to stay ahead of any expiry
SESSION_TTL_SECONDS = 50 * 60

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "origin": "https://jobright.ai",
    "referer": "https://jobright.ai/",
    "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/130.0.0.0 Safari/537.36",
}


class JobrightSessionManager:
    """Manages Jobright.ai authentication and SESSION_ID lifecycle."""

    def __init__(self):
        self._session_id: Optional[str] = None
        self._obtained_at: float = 0
        self._lock = asyncio.Lock()

    async def get_session_id(self) -> str:
        """
        Return a valid SESSION_ID. Logs in automatically if needed.
        Falls back to the static JOBRIGHT_COOKIE from .env if login fails.
        """
        # Fast path: session is still fresh
        if self._session_id and not self._is_expired():
            return self._session_id

        async with self._lock:
            # Double-check after acquiring lock (another task may have refreshed)
            if self._session_id and not self._is_expired():
                return self._session_id

            # Try auto-login
            sid = await self._login()
            if sid:
                self._session_id = sid
                self._obtained_at = time.time()
                return sid

            # Fallback to static cookie from .env
            if settings.JOBRIGHT_COOKIE:
                logger.warning(
                    "[Jobright] Auto-login failed, falling back to static JOBRIGHT_COOKIE"
                )
                self._session_id = settings.JOBRIGHT_COOKIE
                self._obtained_at = time.time()
                return self._session_id

            raise RuntimeError(
                "Jobright login failed and no JOBRIGHT_COOKIE fallback configured"
            )

    async def refresh(self) -> str:
        """Force a fresh login (called after a 401 or bad API response)."""
        async with self._lock:
            logger.info("[Jobright] Forcing session refresh...")
            self._session_id = None
            self._obtained_at = 0

        return await self.get_session_id()

    def _is_expired(self) -> bool:
        return (time.time() - self._obtained_at) > SESSION_TTL_SECONDS

    async def _login(self) -> Optional[str]:
        """POST email/password to Jobright and extract SESSION_ID cookie."""
        email = settings.JOBRIGHT_EMAIL
        password = settings.JOBRIGHT_PASSWORD

        if not email or not password:
            logger.warning(
                "[Jobright] JOBRIGHT_EMAIL / JOBRIGHT_PASSWORD not set, "
                "cannot auto-login"
            )
            return None

        proxy = settings.PROXY_URL
        proxies = {"http": proxy, "https": proxy} if proxy else None

        try:
            async with AsyncSession(
                impersonate="chrome", proxies=proxies, verify=False
            ) as session:
                logger.info(f"[Jobright] Logging in as {email}...")

                resp = await session.post(
                    LOGIN_URL,
                    json={"email": email, "password": password},
                    headers=HEADERS,
                    timeout=20,
                )

                # Extract SESSION_ID from Set-Cookie header
                set_cookie = resp.headers.get("set-cookie", "")
                sid = None

                if "SESSION_ID=" in set_cookie:
                    sid = set_cookie.split("SESSION_ID=")[1].split(";")[0]

                # Also check response cookies
                if not sid and resp.cookies:
                    sid = resp.cookies.get("SESSION_ID")

                if resp.status_code == 200 and sid:
                    # Verify the response body indicates success
                    try:
                        body = resp.json()
                        if body.get("success") is True:
                            logger.info(
                                f"[Jobright] Login successful! "
                                f"SESSION_ID={sid[:8]}..."
                            )
                            return sid
                        else:
                            logger.error(
                                f"[Jobright] Login response not successful: "
                                f"{body.get('errorMsg', 'unknown error')}"
                            )
                    except Exception:
                        # Got a cookie but couldn't parse body — use it anyway
                        logger.warning(
                            "[Jobright] Got SESSION_ID but couldn't parse body"
                        )
                        return sid
                else:
                    error_msg = "unknown"
                    try:
                        body = resp.json()
                        error_msg = body.get("errorMsg", str(body))
                    except Exception:
                        error_msg = resp.text[:200]
                    logger.error(
                        f"[Jobright] Login failed: HTTP {resp.status_code}, "
                        f"error={error_msg}"
                    )
                    return None

        except Exception as e:
            logger.error(f"[Jobright] Login error: {e}", exc_info=True)
            return None


# Module-level singleton
session_manager = JobrightSessionManager()
