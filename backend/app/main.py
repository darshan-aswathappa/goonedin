from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
import redis.asyncio as aioredis
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel

# Import our components
from app.core.config import get_settings
from app.core.redis_config import (
    seed_config_if_missing,
    get_target_keywords,
    get_blocked_companies,
    get_title_filter_keywords,
    get_all_config,
    set_config_list,
)
from app.api import websocket
from app.services.scraper_linkedin import fetch_linkedin_jobs
from app.services.scraper_jobright import fetch_jobright_jobs
from app.services.scraper_jobright_minisites import fetch_jobright_minisites_jobs
from app.services.scraper_fidelity import fetch_fidelity_jobs
from app.services.scraper_statestreet import fetch_statestreet_jobs
from app.services.scraper_mathworks import fetch_mathworks_jobs
from app.services.notification import send_telegram_alert
from app.api.websocket import manager, log_manager
from app.services.log_handler import BroadcastLogHandler, get_historical_logs

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VelocityMain")

# Add broadcast handler to stream logs to frontend (exclude WebSocket logs)
broadcast_handler = BroadcastLogHandler(log_manager.broadcast)
broadcast_handler.setLevel(logging.INFO)
logging.getLogger("VelocityMain").addHandler(broadcast_handler)
logging.getLogger("VelocityScraper").addHandler(broadcast_handler)

settings = get_settings()

# How recent a job must be to trigger an alert
# f_TPR=r300 in the LinkedIn URL already filters to last 5 min, so we use a generous window
JOB_RECENCY_MINUTES = 600
# How long to remember a seen job (prevents re-alerting across restarts)
SEEN_JOB_TTL_SECONDS = 60 * 60 * 2  # 1 hour 30 minutes
FIDELITY_TTL_SECONDS = 24 * 60 * 60  # 24 hours for Fidelity jobs

redis_client: aioredis.Redis = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await redis_client.ping()
        logger.info("Redis connection established.")
        broadcast_handler.set_redis_client(redis_client)
        await seed_config_if_missing(redis_client)
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


async def matches_target_keywords(job) -> bool:
    """Returns True if the job title contains at least one of our target keywords."""
    title_lower = job.title.lower()
    target_keywords = await get_target_keywords(redis_client)
    return any(kw.lower() in title_lower for kw in target_keywords)


async def is_already_seen(job_key: str) -> bool:
    """Checks Redis. Falls back to False (allow alert) if Redis is unavailable."""
    try:
        return bool(await redis_client.exists(job_key))
    except Exception:
        return False


async def mark_as_seen(job_key: str, job_data: dict = None, ttl_seconds: int = None):
    """Writes the job key to Redis with a TTL, storing full job data."""
    try:
        import json
        ttl = ttl_seconds if ttl_seconds is not None else SEEN_JOB_TTL_SECONDS
        value = json.dumps(job_data) if job_data else "1"
        await redis_client.setex(job_key, ttl, value)
    except Exception as e:
        logger.warning(f"Redis write failed for {job_key}: {e}")


async def mark_as_seen_permanent(job_key: str, job_data: dict = None):
    """Writes the job key to Redis with no TTL (stays forever)."""
    try:
        import json
        value = json.dumps(job_data) if job_data else "1"
        await redis_client.set(job_key, value)
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

            # Get current config from Redis
            target_keywords = await get_target_keywords(redis_client)

            # Scrape LinkedIn (per keyword) + Jobright recommend + Jobright mini-sites + Fidelity + State Street
            results = await asyncio.gather(
                *[
                    fetch_linkedin_jobs(redis_client, keywords=kw, location="United States")
                    for kw in target_keywords
                ],
                fetch_jobright_jobs(redis_client),  # Jobright recommend API doesn't need keywords
                fetch_jobright_minisites_jobs(redis_client),  # Public API for newgrad SWE jobs
                fetch_fidelity_jobs(redis_client),  # Fidelity Investments career page
                fetch_statestreet_jobs(redis_client),  # State Street career page
                fetch_mathworks_jobs(redis_client),  # MathWorks career page (Playwright)
            )

            total_calls = len(results)
            failed = sum(1 for r in results if r["failed"])
            passed = total_calls - failed
            retried = sum(1 for r in results if r["retries"] > 0)
            retried_and_passed = sum(1 for r in results if r["retries"] > 0 and not r["failed"])
            success_rate = (passed / total_calls * 100) if total_calls else 0

            # Collect jobs from all sources
            minisites_recent_jobs = []
            fidelity_jobs = []
            statestreet_jobs = []
            mathworks_jobs = []
            for r in results:
                # For mini-sites, Fidelity, State Street, and MathWorks, only use recent_jobs
                if "recent_jobs" in r and r["recent_jobs"]:
                    first_job = r["recent_jobs"][0] if r["recent_jobs"] else None
                    if first_job and first_job.source == "JobrightMiniSites":
                        minisites_recent_jobs.extend(r["recent_jobs"])
                    elif first_job and first_job.source == "Fidelity":
                        fidelity_jobs.extend(r["recent_jobs"])
                    elif first_job and first_job.source == "StateStreet":
                        statestreet_jobs.extend(r["recent_jobs"])
                    elif first_job and first_job.source == "MathWorks":
                        mathworks_jobs.extend(r["recent_jobs"])
                    else:
                        all_jobs.extend(r["jobs"])
                else:
                    all_jobs.extend(r["jobs"])

            logger.info(
                f"Cycle stats: {total_calls} calls | {passed} passed | {failed} failed | "
                f"{retried} retried | {retried_and_passed} passed after retry | "
                f"{success_rate:.1f}% success rate"
            )

            new_finds = 0

            # Process regular jobs (LinkedIn, Jobright recommend)
            for job in all_jobs:
                # Jobright jobs are pre-filtered by score (>= 92), skip time/keyword filters
                if job.source != "Jobright":
                    # 1. Must have been posted within the last 10 minutes
                    if not is_recent(job.posted_at):
                        continue

                    # 2. Title must contain a target keyword
                    if not await matches_target_keywords(job):
                        continue

                job_key = f"seen_job:{job.source}:{job.external_id}"

                # Must not have been alerted before (Redis dedup, survives restarts)
                if await is_already_seen(job_key):
                    continue

                job_dict = job.model_dump(mode="json")
                await mark_as_seen(job_key, job_dict)
                new_finds += 1

                # Broadcast to WebSocket (frontend)
                await manager.broadcast({
                    "type": "NEW_JOB",
                    "data": job_dict
                })

                # Fire Telegram alert
                await send_telegram_alert(job)

                logger.info(f"New Target Acquired: {job.title} @ {job.company} ({job.location})")

            # Process mini-sites jobs (only recent ones, posted < 5 min)
            for job in minisites_recent_jobs:
                job_key = f"seen_job:{job.source}:{job.external_id}"

                if await is_already_seen(job_key):
                    continue

                job_dict = job.model_dump(mode="json")
                await mark_as_seen(job_key, job_dict)
                new_finds += 1

                await manager.broadcast({
                    "type": "NEW_JOB",
                    "data": job_dict
                })

                await send_telegram_alert(job)

                logger.info(f"New Target (MiniSites): {job.title} @ {job.company} ({job.location})")

            # Process Fidelity jobs (posted today)
            for job in fidelity_jobs:
                job_key = f"seen_job:{job.source}:{job.external_id}"

                if await is_already_seen(job_key):
                    continue

                job_dict = job.model_dump(mode="json")
                await mark_as_seen(job_key, job_dict, ttl_seconds=FIDELITY_TTL_SECONDS)
                new_finds += 1

                await manager.broadcast({
                    "type": "NEW_JOB",
                    "data": job_dict
                })

                await send_telegram_alert(job)

                logger.info(f"New Target (Fidelity): {job.title} @ {job.company} ({job.location})")

            # Process State Street jobs (posted < 5 min)
            for job in statestreet_jobs:
                job_key = f"seen_job:{job.source}:{job.external_id}"

                if await is_already_seen(job_key):
                    continue

                job_dict = job.model_dump(mode="json")
                await mark_as_seen(job_key, job_dict)
                new_finds += 1

                await manager.broadcast({
                    "type": "NEW_JOB",
                    "data": job_dict
                })

                await send_telegram_alert(job)

                logger.info(f"New Target (StateStreet): {job.title} @ {job.company} ({job.location})")

            # Process MathWorks jobs (no posted date, infinite TTL to avoid re-alerting)
            for job in mathworks_jobs:
                job_key = f"seen_job:{job.source}:{job.external_id}"

                if await is_already_seen(job_key):
                    continue

                job_dict = job.model_dump(mode="json")
                await mark_as_seen_permanent(job_key, job_dict)
                new_finds += 1

                await manager.broadcast({
                    "type": "NEW_JOB",
                    "data": job_dict
                })

                await send_telegram_alert(job)

                logger.info(f"New Target (MathWorks): {job.title} @ {job.company} ({job.location})")

            if new_finds == 0:
                logger.debug("No new targets found this cycle.")

        except Exception as e:
            logger.error(f"Main loop error: {e}")

        await asyncio.sleep(240)  # 4 min — overlaps the 5-min API window by 1 min


@app.get("/")
def read_root():
    return {
        "status": "active",
        "message": "I am watching everything for you, LO.",
        "recency_filter_minutes": JOB_RECENCY_MINUTES,
    }


@app.get("/server-time")
def get_server_time():
    """Returns the current server date and time in EST."""
    from zoneinfo import ZoneInfo
    now_utc = datetime.now(timezone.utc)
    now_est = now_utc.astimezone(ZoneInfo("America/New_York"))
    return {
        "utc": now_utc.isoformat(),
        "est": now_est.isoformat(),
        "formatted": now_est.strftime("%Y-%m-%d %H:%M:%S EST"),
    }


@app.get("/jobs")
async def get_jobs():
    """Fetch all jobs currently stored in Redis."""
    import json
    jobs = []
    try:
        cursor = 0
        while True:
            cursor, keys = await redis_client.scan(cursor, match="seen_job:*", count=100)
            for key in keys:
                try:
                    value = await redis_client.get(key)
                    if value and value != "1":
                        job_data = json.loads(value)
                        ttl = await redis_client.ttl(key)
                        job_data["ttl"] = ttl
                        jobs.append(job_data)
                except (json.JSONDecodeError, Exception):
                    continue
            if cursor == 0:
                break
    except Exception as e:
        logger.error(f"Error fetching jobs from Redis: {e}")
    
    # Sort by posted_at (most recent first), handling None values
    jobs.sort(key=lambda x: x.get("posted_at") or "", reverse=True)
    return {"jobs": jobs, "count": len(jobs)}


class ConfigUpdateRequest(BaseModel):
    values: list[str]


@app.get("/config")
async def get_config():
    """Get all config values from Redis."""
    return await get_all_config(redis_client)


@app.get("/config/target-keywords")
async def get_target_keywords_endpoint():
    """Get target keywords from Redis."""
    keywords = await get_target_keywords(redis_client)
    return {"target_keywords": keywords, "count": len(keywords)}


@app.put("/config/target-keywords")
async def update_target_keywords(request: ConfigUpdateRequest):
    """Update target keywords in Redis."""
    success = await set_config_list(redis_client, "target_keywords", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "target_keywords": request.values, "count": len(request.values)}


@app.get("/config/target-locations")
async def get_target_locations_endpoint():
    """Get target locations from Redis."""
    from app.core.redis_config import get_target_locations
    locations = await get_target_locations(redis_client)
    return {"target_locations": locations, "count": len(locations)}


@app.put("/config/target-locations")
async def update_target_locations(request: ConfigUpdateRequest):
    """Update target locations in Redis."""
    success = await set_config_list(redis_client, "target_locations", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "target_locations": request.values, "count": len(request.values)}


@app.get("/config/blocked-companies")
async def get_blocked_companies_endpoint():
    """Get blocked companies from Redis."""
    companies = await get_blocked_companies(redis_client)
    return {"blocked_companies": companies, "count": len(companies)}


@app.put("/config/blocked-companies")
async def update_blocked_companies(request: ConfigUpdateRequest):
    """Update blocked companies in Redis."""
    success = await set_config_list(redis_client, "blocked_companies", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "blocked_companies": request.values, "count": len(request.values)}


@app.get("/config/title-filter-keywords")
async def get_title_filter_keywords_endpoint():
    """Get title filter keywords from Redis."""
    keywords = await get_title_filter_keywords(redis_client)
    return {"title_filter_keywords": keywords, "count": len(keywords)}


@app.put("/config/title-filter-keywords")
async def update_title_filter_keywords(request: ConfigUpdateRequest):
    """Update title filter keywords in Redis."""
    success = await set_config_list(redis_client, "title_filter_keywords", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "title_filter_keywords": request.values, "count": len(request.values)}


@app.get("/logs")
async def get_logs(limit: int = 500):
    """Fetch historical system logs from Redis (last 6 hours)."""
    logs = await get_historical_logs(redis_client, limit=limit)
    return {"logs": logs, "count": len(logs)}


class BlockCompanyRequest(BaseModel):
    company: str


@app.post("/jobs/block")
async def block_company_and_remove_jobs(request: BlockCompanyRequest):
    """Block a company and remove ALL jobs from that company in Redis."""
    import json
    try:
        # 1. Add company to blocked companies list
        blocked_companies = await get_blocked_companies(redis_client)
        if request.company not in blocked_companies:
            blocked_companies.append(request.company)
            await set_config_list(redis_client, "blocked_companies", blocked_companies)
            logger.info(f"Added '{request.company}' to blocked companies")

        # 2. Find and delete ALL jobs from this company in Redis
        deleted_job_ids = []
        cursor = 0
        while True:
            cursor, keys = await redis_client.scan(cursor, match="seen_job:*", count=100)
            for key in keys:
                try:
                    value = await redis_client.get(key)
                    if value and value != "1":
                        job_data = json.loads(value)
                        if job_data.get("company") == request.company:
                            await redis_client.delete(key)
                            deleted_job_ids.append(job_data.get("external_id"))
                            logger.info(f"Deleted job key: {key}")
                except (json.JSONDecodeError, Exception):
                    continue
            if cursor == 0:
                break

        # 3. Broadcast the removal to all connected clients
        await manager.broadcast({
            "type": "COMPANY_BLOCKED",
            "data": {
                "company": request.company,
                "deleted_job_ids": deleted_job_ids,
            }
        })

        return {
            "success": True,
            "message": f"Blocked '{request.company}' and removed {len(deleted_job_ids)} job(s)",
            "blocked_companies_count": len(blocked_companies),
            "deleted_jobs_count": len(deleted_job_ids),
        }
    except Exception as e:
        logger.error(f"Error blocking company: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DismissJobRequest(BaseModel):
    source: str
    external_id: str


@app.post("/jobs/dismiss")
async def dismiss_job(request: DismissJobRequest):
    """Dismiss a single job (remove from Redis without blocking the company)."""
    try:
        job_key = f"seen_job:{request.source}:{request.external_id}"
        deleted = await redis_client.delete(job_key)
        
        if deleted:
            logger.info(f"Dismissed job: {job_key}")
            
            await manager.broadcast({
                "type": "JOB_DISMISSED",
                "data": {
                    "external_id": request.external_id,
                }
            })
            
            return {
                "success": True,
                "message": "Job dismissed",
            }
        else:
            return {
                "success": False,
                "message": "Job not found",
            }
    except Exception as e:
        logger.error(f"Error dismissing job: {e}")
        raise HTTPException(status_code=500, detail=str(e))
