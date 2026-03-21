"""
Jobright.ai Session Registry — per-user auto-login via curl_cffi.
"""

import asyncio
import logging
import time
from typing import Optional, TYPE_CHECKING

from curl_cffi.requests import AsyncSession
from app.core.config import get_settings

if TYPE_CHECKING:
    from app.services.jobright_credentials import JobrightCreds

logger = logging.getLogger("JobrightSession")
settings = get_settings()

LOGIN_URL = "https://jobright.ai/swan/auth/login/pwd"
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


class _UserSession:
    """Per-user session state."""
    __slots__ = ("session_id", "obtained_at", "lock")

    def __init__(self):
        self.session_id: Optional[str] = None
        self.obtained_at: float = 0
        self.lock: asyncio.Lock = asyncio.Lock()


class JobrightSessionRegistry:
    """Registry of per-user Jobright sessions."""

    def __init__(self):
        self._users: dict[str, _UserSession] = {}

    def _get_or_create(self, user_id: str) -> _UserSession:
        if user_id not in self._users:
            self._users[user_id] = _UserSession()
        return self._users[user_id]

    async def get_session_id(self, user_id: str, creds: "JobrightCreds") -> str:
        user_sess = self._get_or_create(user_id)

        if user_sess.session_id and not self._is_expired(user_sess):
            return user_sess.session_id

        async with user_sess.lock:
            if user_sess.session_id and not self._is_expired(user_sess):
                return user_sess.session_id

            sid = await self._login(creds["email"], creds["password"])
            if sid:
                user_sess.session_id = sid
                user_sess.obtained_at = time.time()
                return sid

            raise RuntimeError(
                f"Jobright login failed for user {user_id}. "
                "Check credentials in Settings → Jobright."
            )

    async def refresh(self, user_id: str, creds: "JobrightCreds") -> str:
        user_sess = self._get_or_create(user_id)
        async with user_sess.lock:
            user_sess.session_id = None
            user_sess.obtained_at = 0
        return await self.get_session_id(user_id, creds)

    def evict(self, user_id: str) -> None:
        """Remove cached session (called when credentials change or are deleted)."""
        self._users.pop(user_id, None)

    @staticmethod
    def _is_expired(sess: _UserSession) -> bool:
        return (time.time() - sess.obtained_at) > SESSION_TTL_SECONDS

    @staticmethod
    async def _login(email: str, password: str) -> Optional[str]:
        """POST email/password to Jobright and extract SESSION_ID cookie."""
        if not email or not password:
            logger.warning("[Jobright] No credentials provided for login")
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

                set_cookie = resp.headers.get("set-cookie", "")
                sid = None

                if "SESSION_ID=" in set_cookie:
                    sid = set_cookie.split("SESSION_ID=")[1].split(";")[0]

                if not sid and resp.cookies:
                    sid = resp.cookies.get("SESSION_ID")

                if resp.status_code == 200 and sid:
                    try:
                        body = resp.json()
                        if body.get("success") is True:
                            logger.info(f"[Jobright] Login successful! SESSION_ID={sid[:8]}...")
                            return sid
                        else:
                            logger.error(
                                f"[Jobright] Login response not successful: "
                                f"{body.get('errorMsg', 'unknown error')}"
                            )
                    except Exception:
                        logger.warning("[Jobright] Got SESSION_ID but couldn't parse body")
                        return sid
                else:
                    error_msg = "unknown"
                    try:
                        body = resp.json()
                        error_msg = body.get("errorMsg", str(body))
                    except Exception:
                        error_msg = resp.text[:200]
                    logger.error(
                        f"[Jobright] Login failed: HTTP {resp.status_code}, error={error_msg}"
                    )
                    return None

        except Exception as e:
            logger.error(f"[Jobright] Login error: {e}", exc_info=True)
            return None


# Module-level registry (replaces the old singleton session_manager)
session_registry = JobrightSessionRegistry()
