from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
import redis.asyncio as aioredis
from datetime import datetime, timezone, timedelta

# Import our components
from app.core.config import get_settings
from app.api import websocket
from app.services.scraper_linkedin import fetch_linkedin_jobs
from app.services.scraper_glassdoor import fetch_glassdoor_jobs
from app.services.notification import send_telegram_alert
from app.api.websocket import manager

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VelocityMain")

settings = get_settings()

# How recent a job must be to trigger an alert
JOB_RECENCY_MINUTES = 10
# How long to remember a seen job (prevents re-alerting across restarts)
SEEN_JOB_TTL_SECONDS = 60 * 60 * 24  # 24 hours

redis_client: aioredis.Redis = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await redis_client.ping()
        logger.info("Redis connection established.")
    except Exception as e:
        logger.error(f"Redis connection failed: {e}. Deduplication will not persist across restarts.")
    asyncio.create_task(run_scraper_loop())
    yield
    await redis_client.aclose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="High-Frequency Job Monitor for LO",
    lifespan=lifespan
)

# CORS - Open wide for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the WebSocket router
app.include_router(websocket.router)


def is_recent(posted_at: datetime | None) -> bool:
    """Returns True if the job was posted within JOB_RECENCY_MINUTES."""
    if not posted_at:
        return False
    now = datetime.now(timezone.utc)
    if posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    return (now - posted_at) <= timedelta(minutes=JOB_RECENCY_MINUTES)


def matches_target_keywords(job) -> bool:
    """Returns True if the job title contains at least one of our target keywords."""
    title_lower = job.title.lower()
    return any(kw.lower() in title_lower for kw in settings.TARGET_KEYWORDS)


def matches_target_location(job) -> bool:
    """Returns True if the job location matches one of our target locations, or is remote."""
    location_lower = job.location.lower()
    if "remote" in location_lower:
        return True
    return any(loc.lower() in location_lower for loc in settings.TARGET_LOCATIONS)


async def is_already_seen(job_key: str) -> bool:
    """Checks Redis. Falls back to False (allow alert) if Redis is unavailable."""
    try:
        return bool(await redis_client.exists(job_key))
    except Exception:
        return False


async def mark_as_seen(job_key: str):
    """Writes the job key to Redis with a 24hr TTL."""
    try:
        await redis_client.setex(job_key, SEEN_JOB_TTL_SECONDS, "1")
    except Exception as e:
        logger.warning(f"Redis write failed for {job_key}: {e}")


async def run_scraper_loop():
    """
    The heartbeat. Scrapes all target keywords every 30 seconds,
    filters for recent + relevant jobs, and fires alerts only for new finds.
    """
    logger.info("Velocity Monitor System: ONLINE. Hunting for LO...")

    while True:
        try:
            all_jobs = []

            # Scrape every target keyword, not just the first one
            for keyword in settings.TARGET_KEYWORDS:
                jobs = await fetch_linkedin_jobs(keywords=keyword)
                all_jobs.extend(jobs)
                await asyncio.sleep(2)  # small pause between keyword requests

            new_finds = 0

            for job in all_jobs:
                # 1. Must have been posted within the last 10 minutes
                if not is_recent(job.posted_at):
                    continue

                # 2. Title must contain a target keyword
                if not matches_target_keywords(job):
                    continue

                # 3. Location must match a target location (or be remote)
                if not matches_target_location(job):
                    continue

                job_key = f"seen_job:{job.source}:{job.external_id}"

                # 4. Must not have been alerted before (Redis dedup, survives restarts)
                if await is_already_seen(job_key):
                    continue

                await mark_as_seen(job_key)
                new_finds += 1

                # Broadcast to WebSocket (frontend)
                await manager.broadcast({
                    "type": "NEW_JOB",
                    "data": job.model_dump(mode="json")
                })

                # Fire Telegram alert
                await send_telegram_alert(job)

                logger.info(f"New Target Acquired: {job.title} @ {job.company} ({job.location})")

            if new_finds == 0:
                logger.debug("No new targets found this cycle.")

        except Exception as e:
            logger.error(f"Main loop error: {e}")

        await asyncio.sleep(30)


@app.get("/")
def read_root():
    return {
        "status": "active",
        "message": "I am watching everything for you, LO.",
        "recency_filter_minutes": JOB_RECENCY_MINUTES,
    }
