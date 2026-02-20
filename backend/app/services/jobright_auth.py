import asyncio
import logging
from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger("JobrightAuth")

_auth_lock = asyncio.Lock()


async def fetch_jobright_api_via_playwright(url: str, count: int = 50) -> dict:
    """
    Uses Playwright to log into jobright.ai and fetch the recommend API directly.
    No cookie caching - fresh login every time for reliability.
    Returns the parsed JSON response or empty dict on failure.
    """
    if not settings.JOBRIGHT_EMAIL or not settings.JOBRIGHT_PASSWORD:
        logger.error("JOBRIGHT_EMAIL or JOBRIGHT_PASSWORD not configured")
        return {}

    async with _auth_lock:
        logger.info("Starting Jobright login + API fetch via Playwright...")

        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                launch_args = {"headless": True}

                if settings.PROXY_URL:
                    launch_args["proxy"] = {"server": settings.PROXY_URL}
                    logger.info("Using proxy for Playwright")

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
                    logger.info("Login successful - landed on jobs page")
                except:
                    try:
                        await page.wait_for_url("**/dashboard**", timeout=5000)
                        logger.info("Login successful - landed on dashboard")
                    except:
                        await asyncio.sleep(3)
                        logger.info("Login completed - proceeding with API call")

                api_url = f"{url}?refresh=true&sortCondition=2&position=0&count={count}"
                
                api_response = await context.request.get(
                    api_url,
                    headers={
                        "Accept": "application/json, text/plain, */*",
                        "x-client-type": "web",
                        "Referer": "https://jobright.ai/jobs/recommend",
                    }
                )

                if api_response.status == 200:
                    data = await api_response.json()
                    logger.info(f"Jobright API call successful via Playwright")
                    await browser.close()
                    return data
                else:
                    body = await api_response.text()
                    logger.error(f"Jobright API returned {api_response.status}: {body[:200]}")
                    await browser.close()
                    return {}

        except Exception as e:
            logger.error(f"Jobright Playwright fetch failed: {type(e).__name__}: {e}")
            return {}
