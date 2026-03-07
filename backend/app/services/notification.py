import httpx
import logging
from app.models.job import JobCreate

logger = logging.getLogger("VelocityNotification")


async def send_telegram_alert(
    job: JobCreate, bot_token: str | None, chat_id: str | None
) -> None:
    """Send a Telegram alert for a job. Silently skips if credentials are not configured."""
    if not bot_token or not chat_id:
        return

    lines = [
        f"<b>Role:</b> {job.title}",
        f"<b>Company:</b> {job.company}",
        f"<b>Location:</b> {job.location}",
        f"<b>Source:</b> {job.source}",
        "",
        f"🔗 <a href='{job.url}'><b>APPLY NOW</b></a>",
    ]
    message = "\n".join(lines)

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=payload, timeout=5.0)
            if response.status_code != 200:
                logger.error(f"Failed to send Telegram alert: {response.text}")
            else:
                logger.info(f"Alert sent for {job.title} at {job.company}")
        except Exception as e:
            logger.error(f"Telegram connection error: {e}")
