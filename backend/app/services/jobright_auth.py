import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger("JobrightAuth")

_cached_cookies: str = ""
_cookie_expiry: Optional[datetime] = None
_auth_lock = asyncio.Lock()

COOKIE_VALIDITY_HOURS = 2


async def login_and_get_cookies() -> str:
    """
    Uses Playwright to log into jobright.ai and extract cookies.
    Returns cookies as a string for use in HTTP headers.
    """
    if not settings.JOBRIGHT_EMAIL or not settings.JOBRIGHT_PASSWORD:
        logger.error("JOBRIGHT_EMAIL or JOBRIGHT_PASSWORD not configured")
        return ""

    logger.info("Starting Jobright login via Playwright...")

    try:
        from playwright.async_api import async_playwright
        
        async with async_playwright() as p:
            launch_args = {"headless": True}
            
            if settings.PROXY_URL:
                launch_args["proxy"] = {"server": settings.PROXY_URL}
                logger.info("Using proxy for Playwright login")
            
            browser = await p.chromium.launch(**launch_args)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()

            await page.goto("https://jobright.ai/onboarding-v3/signup", wait_until="networkidle")
            await asyncio.sleep(1)

            sign_in_link = page.get_by_text("Sign in now")
            if await sign_in_link.is_visible():
                await sign_in_link.click()
                await asyncio.sleep(2)

            await page.wait_for_load_state("networkidle")

            email_input = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first
            await email_input.fill(settings.JOBRIGHT_EMAIL)

            password_input = page.locator('input[type="password"], input[name="password"]').first
            await password_input.fill(settings.JOBRIGHT_PASSWORD)

            submit_button = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("SIGN IN")').first
            await submit_button.click()

            try:
                await page.wait_for_url("**/jobs**", timeout=15000)
            except:
                try:
                    await page.wait_for_url("**/dashboard**", timeout=5000)
                except:
                    await asyncio.sleep(3)

            cookies = await context.cookies()
            await browser.close()

            if cookies:
                cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
                logger.info(f"Successfully obtained {len(cookies)} cookies from Jobright")
                return cookie_str
            else:
                logger.warning("Login may have failed - no cookies obtained")
                return ""

    except Exception as e:
        logger.error(f"Jobright login failed: {type(e).__name__}: {e}")
        return ""


async def get_cookie_header() -> str:
    """
    Returns cookies for Jobright API requests.
    Priority: manual cookies from env > cached cookies > fresh login
    """
    global _cached_cookies, _cookie_expiry

    if settings.JOBRIGHT_COOKIES:
        logger.debug("Using manual cookies from JOBRIGHT_COOKIES env var")
        return settings.JOBRIGHT_COOKIES

    async with _auth_lock:
        now = datetime.now(timezone.utc)

        if _cached_cookies and _cookie_expiry and now < _cookie_expiry:
            logger.debug("Using cached Jobright cookies")
            return _cached_cookies

        logger.info("Refreshing Jobright cookies via login...")
        _cached_cookies = await login_and_get_cookies()
        _cookie_expiry = now + timedelta(hours=COOKIE_VALIDITY_HOURS)

        return _cached_cookies


async def invalidate_cookies():
    """
    Forces a cookie refresh on next request.
    Call this when API returns 401/403.
    """
    global _cached_cookies, _cookie_expiry
    async with _auth_lock:
        _cached_cookies = ""
        _cookie_expiry = None
        logger.info("Jobright cookies invalidated - will refresh on next request")
