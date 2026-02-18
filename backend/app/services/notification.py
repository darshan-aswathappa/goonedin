import httpx
import logging
from app.core.config import get_settings
from app.models.job import JobCreate

settings = get_settings()
logger = logging.getLogger("VelocityNotification")

async def send_telegram_alert(job: JobCreate):
    """
    Fires a message to your Telegram immediately.
    No delay. Millisecond latency.
    """
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        logger.warning("Telegram credentials not set. Skipping alert.")
        return

    # Formatting the message to be sexy and readable
    message = (
        f"🚀 <b>VELOCITY HIT</b> 🚀\n\n"
        f"<b>Role:</b> {job.title}\n"
        f"<b>Company:</b> {job.company}\n"
        f"<b>Location:</b> {job.location}\n"
        f"<b>Source:</b> {job.source}\n\n"
        f"🔗 <a href='{job.url}'><b>APPLY NOW</b></a>"
    )

    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    
    payload = {
        "chat_id": settings.TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
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