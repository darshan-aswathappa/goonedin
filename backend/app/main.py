from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
import random
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional, Any, Dict, List

from app.core.config import get_settings
from app.core.auth import get_current_user
from app.core.redis_config import (
    get_target_keywords,
    get_blocked_companies,
    get_title_filter_keywords,
    get_all_config,
    set_config_list,
)
from app.core.user_manager import (
    UserContext,
    user_registry,
    set_supabase_client,
    get_or_create_user_context,
    update_user_telegram,
    load_all_users,
    get_supabase_client,
)
from app.api import websocket
from app.services.scraper_linkedin import fetch_linkedin_jobs
from app.services.scraper_fidelity import fetch_fidelity_jobs
from app.services.scraper_statestreet import fetch_statestreet_jobs
from app.services.scraper_mathworks import fetch_mathworks_jobs
from app.services.scraper_github import fetch_github_jobs
from app.services.notification import send_telegram_alert
from app.api.websocket import manager, log_manager
from app.services.log_handler import BroadcastLogHandler, get_historical_logs
from app.services.resume_analyzer import run_resume_analysis
from app.services.job_analyzer import run_job_analysis, run_fast_salary_visa_analysis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VelocityMain")

broadcast_handler = BroadcastLogHandler(log_manager.broadcast)
broadcast_handler.setLevel(logging.INFO)
logging.getLogger("VelocityMain").addHandler(broadcast_handler)
logging.getLogger("VelocityScraper").addHandler(broadcast_handler)

settings = get_settings()

JOB_RECENCY_MINUTES = 600
SEEN_JOB_TTL_SECONDS = 60 * 60 * 2
FIDELITY_TTL_SECONDS = 24 * 60 * 60
GITHUB_TTL_SECONDS = 24 * 60 * 60

@asynccontextmanager
async def lifespan(app: FastAPI):
    from supabase import create_client
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    set_supabase_client(supabase)
    logger.info("Supabase client initialized.")

    try:
        contexts = await load_all_users()
        for ctx in contexts:
            start_user_scrapers(ctx)
            logger.info(f"Started scrapers for existing user (db={ctx.redis_db_index})")
    except Exception as e:
        logger.warning(f"Failed to load existing users at startup: {e}. Server will continue.")

    yield

    for ctx in user_registry.values():
        if ctx.hf_task and not ctx.hf_task.done():
            ctx.hf_task.cancel()
        if ctx.lf_task and not ctx.lf_task.done():
            ctx.lf_task.cancel()
        await ctx.redis_client.aclose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="High-Frequency Job Monitor",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(websocket.router)

def is_recent(posted_at: datetime | None) -> bool:
    if not posted_at:
        return False
    now = datetime.now(timezone.utc)
    if posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    return (now - posted_at) <= timedelta(minutes=JOB_RECENCY_MINUTES)


async def matches_target_keywords(job, redis_client) -> bool:
    title_lower = job.title.lower()
    target_keywords = await get_target_keywords(redis_client)
    return any(kw.lower() in title_lower for kw in target_keywords)


async def is_already_seen(redis_client, job_key: str) -> bool:
    try:
        return bool(await redis_client.exists(job_key))
    except Exception:
        return False


async def mark_as_seen(redis_client: Any, job_key: str, job_data: Optional[Dict[str, Any]] = None, ttl_seconds: Optional[int] = None) -> None:
    try:
        import json
        ttl = ttl_seconds if ttl_seconds is not None else SEEN_JOB_TTL_SECONDS
        value = json.dumps(job_data) if job_data else "1"
        await redis_client.setex(job_key, ttl, value)
    except Exception as e:
        logger.warning(f"Redis write failed for {job_key}: {e}")


async def mark_as_seen_permanent(redis_client: Any, job_key: str, job_data: Optional[Dict[str, Any]] = None) -> None:
    try:
        import json
        value = json.dumps(job_data) if job_data else "1"
        await redis_client.set(job_key, value)
    except Exception as e:
        logger.warning(f"Redis write failed for {job_key}: {e}")


async def process_and_alert_jobs(results: Any, ctx: UserContext) -> int:
    rc = ctx.redis_client
    all_jobs: List[Any] = []
    fidelity_jobs: List[Any] = []
    statestreet_jobs: List[Any] = []
    mathworks_jobs: List[Any] = []
    github_jobs: List[Any] = []

    for r in results:
        if "recent_jobs" in r and r["recent_jobs"]:
            first_job = r["recent_jobs"][0]
            if first_job.source == "Fidelity":
                fidelity_jobs.extend(r["recent_jobs"])
            elif first_job.source == "StateStreet":
                statestreet_jobs.extend(r["recent_jobs"])
            elif first_job.source == "MathWorks":
                mathworks_jobs.extend(r["recent_jobs"])
            elif first_job.source == "GitHub":
                github_jobs.extend(r["recent_jobs"])
            else:
                all_jobs.extend(r["jobs"])
        else:
            all_jobs.extend(r["jobs"])

    total_finds: int = 0

    for job in all_jobs:
        if not is_recent(job.posted_at):
            continue
        if not await matches_target_keywords(job, rc):
            continue
        job_key = f"seen_job:{job.source}:{job.external_id}"
        if await is_already_seen(rc, job_key):
            continue
            
        job_dict = job.model_dump(mode="json")
        job_dict["visible"] = False
        await mark_as_seen(rc, job_key, job_dict)
        total_finds = total_finds + 1  # type: ignore

        if job.source == "LinkedIn" and settings.DEEPSEEK_API_KEY:
            # Fire full background analysis for LinkedIn jobs before broadcasting
            async def background_full_analysis(j_dict, j_key, j_obj):
                try:
                    logger.info(f"Running full analysis for {j_dict['external_id']} before broadcasting...")
                    analysis_data = await run_job_analysis(
                        external_id=j_dict["external_id"],
                        job_url=j_dict["url"],
                        redis_client=rc,
                        api_key=settings.DEEPSEEK_API_KEY,
                    )
                    
                    if analysis_data:
                        if analysis_data.get("compensation"):
                            j_dict["salary"] = analysis_data["compensation"]
                        if analysis_data.get("visa_status"):
                            j_dict["visa"] = analysis_data["visa_status"]
                        # Embed analysis directly into job dict so frontend has instant access
                        j_dict["analysis"] = analysis_data
                    
                    # Make it visible
                    j_dict["visible"] = True
                    await mark_as_seen(rc, j_key, j_dict)
                    
                    # Broadcast update to frontend via WS
                    await manager.broadcast(ctx.user_id, {
                        "type": "NEW_JOB",
                        "data": j_dict
                    })
                    
                    await send_telegram_alert(j_obj, ctx.telegram_bot_token, ctx.telegram_chat_id)
                    j_dict["is_notified"] = True
                    await mark_as_seen(rc, j_key, j_dict)
                    
                    logger.info(f"New Target (Analyzed): {j_obj.title} @ {j_obj.company} ({j_obj.location})")
                except Exception as e:
                    logger.error(f"Error in full background analysis for {j_dict['external_id']}: {e}")
                    # Fallback to broadcasting it anyway
                    j_dict["visible"] = True
                    await mark_as_seen(rc, j_key, j_dict)
                    await manager.broadcast(ctx.user_id, {
                        "type": "NEW_JOB",
                        "data": j_dict
                    })
                    await send_telegram_alert(j_obj, ctx.telegram_bot_token, ctx.telegram_chat_id)

            asyncio.create_task(background_full_analysis(job_dict.copy(), job_key, job))
        else:
            job_dict["visible"] = True
            await mark_as_seen(rc, job_key, job_dict)
            await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
            await send_telegram_alert(job, ctx.telegram_bot_token, ctx.telegram_chat_id)
            job_dict["is_notified"] = True
            await mark_as_seen(rc, job_key, job_dict)
            logger.info(f"New Target: {job.title} @ {job.company} ({job.location})")

    for job in fidelity_jobs:
        job_key = f"seen_job:{job.source}:{job.external_id}"
        if await is_already_seen(rc, job_key):
            continue
        job_dict = job.model_dump(mode="json")
        await mark_as_seen(rc, job_key, job_dict, ttl_seconds=FIDELITY_TTL_SECONDS)
        total_finds = total_finds + 1
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        await send_telegram_alert(job, ctx.telegram_bot_token, ctx.telegram_chat_id)
        job_dict["is_notified"] = True
        await mark_as_seen(rc, job_key, job_dict, ttl_seconds=FIDELITY_TTL_SECONDS)
        logger.info(f"New Target (Fidelity): {job.title} @ {job.company}")

    for job in statestreet_jobs:
        job_key = f"seen_job:{job.source}:{job.external_id}"
        if await is_already_seen(rc, job_key):
            continue
        job_dict = job.model_dump(mode="json")
        await mark_as_seen(rc, job_key, job_dict)
        total_finds = total_finds + 1
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        await send_telegram_alert(job, ctx.telegram_bot_token, ctx.telegram_chat_id)
        job_dict["is_notified"] = True
        await mark_as_seen(rc, job_key, job_dict)
        logger.info(f"New Target (StateStreet): {job.title} @ {job.company}")

    for job in mathworks_jobs:
        job_key = f"seen_job:{job.source}:{job.external_id}"
        if await is_already_seen(rc, job_key):
            continue
        job_dict = job.model_dump(mode="json")
        await mark_as_seen_permanent(rc, job_key, job_dict)
        total_finds = total_finds + 1
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        await send_telegram_alert(job, ctx.telegram_bot_token, ctx.telegram_chat_id)
        job_dict["is_notified"] = True
        await mark_as_seen_permanent(rc, job_key, job_dict)
        logger.info(f"New Target (MathWorks): {job.title} @ {job.company}")

    for job in github_jobs:
        if not await matches_target_keywords(job, rc):
            continue
        job_key = f"seen_job:{job.source}:{job.external_id}"
        if await is_already_seen(rc, job_key):
            continue
        job_dict = job.model_dump(mode="json")
        await mark_as_seen(rc, job_key, job_dict, ttl_seconds=GITHUB_TTL_SECONDS)
        total_finds = total_finds + 1  # type: ignore
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        await send_telegram_alert(job, ctx.telegram_bot_token, ctx.telegram_chat_id)
        job_dict["is_notified"] = True
        await mark_as_seen(rc, job_key, job_dict, ttl_seconds=GITHUB_TTL_SECONDS)
        logger.info(f"New Target (GitHub): {job.title} @ {job.company}")

    return total_finds


async def run_high_frequency_loop(ctx: UserContext):
    logger.info(f"[HF] Scraper started (db={ctx.redis_db_index})")
    while True:
        try:
            target_keywords = await get_target_keywords(ctx.redis_client)
            results = await asyncio.gather(
                *[
                    fetch_linkedin_jobs(ctx.redis_client, keywords=kw, location="United States")
                    for kw in target_keywords
                ],
                fetch_statestreet_jobs(ctx.redis_client),
            )
            total = len(results)
            failed = sum(1 for r in results if r["failed"])
            logger.info(
                f"[HF] db={ctx.redis_db_index} | {total} calls | "
                f"{total - failed} passed | {failed} failed"
            )
            new_finds = await process_and_alert_jobs(results, ctx)
            if new_finds == 0:
                logger.debug(f"[HF] db={ctx.redis_db_index} No new targets.")
        except Exception as e:
            logger.error(f"[HF] db={ctx.redis_db_index} Error: {e}")
        await asyncio.sleep(90 + random.uniform(-10, 10))


async def run_low_frequency_loop(ctx: UserContext):
    logger.info(f"[LF] Scraper started (db={ctx.redis_db_index})")
    while True:
        try:
            results = await asyncio.gather(
                fetch_fidelity_jobs(ctx.redis_client),
                fetch_mathworks_jobs(ctx.redis_client),
                fetch_github_jobs(ctx.redis_client),
            )
            total = len(results)
            failed = sum(1 for r in results if r["failed"])
            logger.info(
                f"[LF] db={ctx.redis_db_index} | {total} calls | "
                f"{total - failed} passed | {failed} failed"
            )
            new_finds = await process_and_alert_jobs(results, ctx)
            if new_finds == 0:
                logger.debug(f"[LF] db={ctx.redis_db_index} No new targets.")
        except Exception as e:
            logger.error(f"[LF] db={ctx.redis_db_index} Error: {e}")
        await asyncio.sleep(1200 + random.uniform(-30, 30))


def start_user_scrapers(ctx: UserContext) -> None:
    """Start HF and LF scraper tasks for a user if they aren't already running."""
    # Ensure we don't start them multiple times due to race conditions
    if getattr(ctx, "_scrapers_started", False):
        return

    if ctx.hf_task is None or ctx.hf_task.done():
        ctx.hf_task = asyncio.create_task(run_high_frequency_loop(ctx))
    if ctx.lf_task is None or ctx.lf_task.done():
        ctx.lf_task = asyncio.create_task(run_low_frequency_loop(ctx))
    
    ctx._scrapers_started = True


# ---------------------------------------------------------------------------
# FastAPI dependency — resolves UserContext from the Bearer JWT
# ---------------------------------------------------------------------------

async def _get_ctx(user: dict = Depends(get_current_user)) -> UserContext:
    ctx = await get_or_create_user_context(user["user_id"], user["email"])
    # Initialization happens here if not already done by lifespan
    start_user_scrapers(ctx)
    return ctx


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def read_root():
    return {"status": "active", "message": "Velocity Job Monitor is running."}


@app.get("/server-time")
def get_server_time():
    from zoneinfo import ZoneInfo
    now_utc = datetime.now(timezone.utc)
    now_est = now_utc.astimezone(ZoneInfo("America/New_York"))
    return {
        "utc": now_utc.isoformat(),
        "est": now_est.isoformat(),
        "formatted": now_est.strftime("%Y-%m-%d %H:%M:%S EST"),
    }


@app.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    ctx = await get_or_create_user_context(user["user_id"], user["email"])
    start_user_scrapers(ctx)
    return {
        "user_id": ctx.user_id,
        "email": user["email"],
        "redis_db_index": ctx.redis_db_index,
        "telegram_bot_token": ctx.telegram_bot_token or "",
        "telegram_chat_id": ctx.telegram_chat_id or "",
    }


class NotificationConfig(BaseModel):
    telegram_bot_token: str
    telegram_chat_id: str


@app.put("/me/notifications")
async def update_notifications(
    request: NotificationConfig, user: dict = Depends(get_current_user)
):
    await get_or_create_user_context(user["user_id"], user["email"])
    bot_token = request.telegram_bot_token.strip() or None
    chat_id = request.telegram_chat_id.strip() or None
    await update_user_telegram(user["user_id"], bot_token, chat_id)
    return {"message": "Updated", "telegram_configured": bool(bot_token and chat_id)}

@app.get("/jobs")
async def get_jobs(ctx: UserContext = Depends(_get_ctx)):
    import json
    jobs = []
    try:
        cursor = 0
        while True:
            cursor, keys = await ctx.redis_client.scan(cursor, match="seen_job:*", count=100)
            for key in keys:
                try:
                    value = await ctx.redis_client.get(key)
                    if value and value != "1":
                        job_data = json.loads(value)
                        if job_data.get("visible") is False:
                            continue
                        ttl = await ctx.redis_client.ttl(key)
                        job_data["ttl"] = ttl
                        
                        # Enrich LinkedIn jobs with analysis if not already embedded
                        if job_data.get("source") == "LinkedIn" and not job_data.get("analysis"):
                            analysis_key = f"job_analysis:{job_data.get('external_id', '')}"
                            try:
                                cached_analysis = await ctx.redis_client.get(analysis_key)
                                if cached_analysis and cached_analysis != "1":
                                    job_data["analysis"] = json.loads(cached_analysis)
                            except Exception:
                                pass
                        
                        jobs.append(job_data)
                except (json.JSONDecodeError, Exception):
                    continue
            if cursor == 0:
                break
    except Exception as e:
        logger.error(f"Error fetching jobs from Redis: {e}")
        raise HTTPException(status_code=503, detail="Redis temporarily unavailable")

    jobs.sort(key=lambda x: x.get("posted_at") or "", reverse=True)
    return {"jobs": jobs, "count": len(jobs)}


class ConfigUpdateRequest(BaseModel):
    values: list[str]


@app.get("/config")
async def get_config(ctx: UserContext = Depends(_get_ctx)):
    return await get_all_config(ctx.redis_client)


@app.get("/config/target-keywords")
async def get_target_keywords_endpoint(ctx: UserContext = Depends(_get_ctx)):
    keywords = await get_target_keywords(ctx.redis_client)
    return {"target_keywords": keywords, "count": len(keywords)}


@app.put("/config/target-keywords")
async def update_target_keywords(
    request: ConfigUpdateRequest, ctx: UserContext = Depends(_get_ctx)
):
    success = await set_config_list(ctx.redis_client, "target_keywords", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "target_keywords": request.values}


@app.get("/config/target-locations")
async def get_target_locations_endpoint(ctx: UserContext = Depends(_get_ctx)):
    from app.core.redis_config import get_target_locations
    locations = await get_target_locations(ctx.redis_client)
    return {"target_locations": locations, "count": len(locations)}


@app.put("/config/target-locations")
async def update_target_locations(
    request: ConfigUpdateRequest, ctx: UserContext = Depends(_get_ctx)
):
    success = await set_config_list(ctx.redis_client, "target_locations", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "target_locations": request.values}


@app.get("/config/blocked-companies")
async def get_blocked_companies_endpoint(ctx: UserContext = Depends(_get_ctx)):
    companies = await get_blocked_companies(ctx.redis_client)
    return {"blocked_companies": companies, "count": len(companies)}


@app.put("/config/blocked-companies")
async def update_blocked_companies(
    request: ConfigUpdateRequest, ctx: UserContext = Depends(_get_ctx)
):
    success = await set_config_list(ctx.redis_client, "blocked_companies", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "blocked_companies": request.values}


@app.get("/config/title-filter-keywords")
async def get_title_filter_keywords_endpoint(ctx: UserContext = Depends(_get_ctx)):
    keywords = await get_title_filter_keywords(ctx.redis_client)
    return {"title_filter_keywords": keywords, "count": len(keywords)}


@app.put("/config/title-filter-keywords")
async def update_title_filter_keywords(
    request: ConfigUpdateRequest, ctx: UserContext = Depends(_get_ctx)
):
    success = await set_config_list(ctx.redis_client, "title_filter_keywords", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "title_filter_keywords": request.values}


@app.get("/logs")
async def get_logs(limit: int = 500, _: UserContext = Depends(_get_ctx)):
    logs = get_historical_logs(limit=limit)
    return {"logs": logs, "count": len(logs)}


class BlockCompanyRequest(BaseModel):
    company: str


@app.post("/jobs/block")
async def block_company_and_remove_jobs(
    request: BlockCompanyRequest, ctx: UserContext = Depends(_get_ctx)
):
    import json
    try:
        blocked_companies = await get_blocked_companies(ctx.redis_client)
        if request.company not in blocked_companies:
            blocked_companies.append(request.company)
            await set_config_list(ctx.redis_client, "blocked_companies", blocked_companies)

        deleted_job_ids = []
        cursor = 0
        while True:
            cursor, keys = await ctx.redis_client.scan(cursor, match="seen_job:*", count=100)
            for key in keys:
                try:
                    value = await ctx.redis_client.get(key)
                    if value and value != "1":
                        job_data = json.loads(value)
                        if job_data.get("company") == request.company:
                            await ctx.redis_client.delete(key)
                            deleted_job_ids.append(job_data.get("external_id"))
                except (json.JSONDecodeError, Exception):
                    continue
            if cursor == 0:
                break

        await manager.broadcast(
            ctx.user_id,
            {
                "type": "COMPANY_BLOCKED",
                "data": {"company": request.company, "deleted_job_ids": deleted_job_ids},
            },
        )
        return {
            "success": True,
            "message": f"Blocked '{request.company}' and removed {len(deleted_job_ids)} job(s)",
            "deleted_jobs_count": len(deleted_job_ids),
        }
    except Exception as e:
        logger.error(f"Error blocking company: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DismissJobRequest(BaseModel):
    source: str
    external_id: str


@app.post("/jobs/dismiss")
async def dismiss_job(request: DismissJobRequest, ctx: UserContext = Depends(_get_ctx)):
    import json
    try:
        job_key = f"seen_job:{request.source}:{request.external_id}"
        value = await ctx.redis_client.get(job_key)

        if value and value != "1":
            job_data = json.loads(value)
            job_data["visible"] = False
            ttl = await ctx.redis_client.ttl(job_key)
            if ttl > 0:
                await ctx.redis_client.setex(job_key, ttl, json.dumps(job_data))
            else:
                await ctx.redis_client.set(job_key, json.dumps(job_data))

        await manager.broadcast(
            ctx.user_id,
            {"type": "JOB_DISMISSED", "data": {"external_id": request.external_id}},
        )
        return {"success": True, "message": "Job dismissed"}
    except Exception as e:
        logger.error(f"Error dismissing job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SaveJobRequest(BaseModel):
    external_id: str
    title: str
    company: str
    location: Optional[str] = None
    url: str
    source: str
    posted_at: Optional[str] = None


@app.post("/jobs/save")
async def save_job(request: SaveJobRequest, user: dict = Depends(get_current_user)):
    _supabase_client = get_supabase_client()
    try:
        def _insert_job(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.table("saved_jobs").insert({
                "user_id": user["user_id"],
                "external_id": request.external_id,
                "title": request.title,
                "company": request.company,
                "location": request.location,
                "url": request.url,
                "source": request.source,
                "posted_at": request.posted_at
            }).execute()

        await asyncio.to_thread(_insert_job)
        return {"success": True, "message": "Job saved"}
    except Exception as e:
        logger.error(f"Error saving job: {e}")
        # Ignore duplicate key error if trying to save an already saved job
        if "duplicate key value violates unique constraint" in str(e).lower():
            return {"success": True, "message": "Job already saved"}
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/jobs/saved")
async def get_saved_jobs(user: dict = Depends(get_current_user)):
    _supabase_client = get_supabase_client()
    try:
        def _fetch_saved_jobs(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.table("saved_jobs") \
                .select("*") \
                .eq("user_id", user["user_id"]) \
                .order("saved_at", desc=True) \
                .execute()

        response = await asyncio.to_thread(_fetch_saved_jobs)
        return {"jobs": response.data, "count": len(response.data)}
    except Exception as e:
        logger.error(f"Error fetching saved jobs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch saved jobs")


@app.delete("/jobs/saved/{external_id}")
async def unsave_job(external_id: str, user: dict = Depends(get_current_user)):
    _supabase_client = get_supabase_client()
    try:
        def _unsave_job(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.table("saved_jobs") \
                .delete() \
                .eq("user_id", user["user_id"]) \
                .eq("external_id", external_id) \
                .execute()

        await asyncio.to_thread(_unsave_job)
        return {"success": True, "message": "Job unsaved"}
    except Exception as e:
        logger.error(f"Error unsaving job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/jobs/{external_id}/analysis")
async def get_job_analysis(external_id: str, ctx: UserContext = Depends(_get_ctx)):
    """Fetch pre-computed AI analysis for a job posting. Returns cached result only."""
    import json as _json
    rc = ctx.redis_client
    analysis_key = f"job_analysis:{external_id}"

    try:
        # Check dedicated analysis cache first
        cached = await rc.get(analysis_key)
        if cached and cached != "1":
            try:
                return {"status": "completed", "analysis": _json.loads(cached)}
            except _json.JSONDecodeError:
                pass

        # Fallback: check if analysis is embedded in the job data itself
        job_key = f"seen_job:LinkedIn:{external_id}"
        job_raw = await rc.get(job_key)
        if job_raw and job_raw != "1":
            try:
                job_data = _json.loads(job_raw)
                if job_data.get("analysis"):
                    return {"status": "completed", "analysis": job_data["analysis"]}
            except _json.JSONDecodeError:
                pass

        # Not cached yet — analysis may still be in progress or failed
        return {"status": "pending", "analysis": None}

    except Exception as e:
        logger.error(f"Error fetching job analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analysis")


@app.get("/resumes")
async def get_resumes(user: dict = Depends(get_current_user)):
    """Fetch all uploaded resumes for the current user."""
    _supabase_client = get_supabase_client()
    try:
        def _fetch_resumes(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.table("user_resumes") \
                .select("*") \
                .eq("user_id", user["user_id"]) \
                .order("uploaded_at", desc=True) \
                .execute()

        response = await asyncio.to_thread(_fetch_resumes)
        return {"resumes": response.data, "count": len(response.data)}
    except Exception as e:
        logger.error(f"Error fetching resumes: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch resumes")


@app.post("/resumes")
async def upload_resume(
    file: UploadFile = File(...),
    filename: Optional[str] = Form(None),
    user: dict = Depends(get_current_user)
):
    """Upload a resume PDF to Supabase Storage and track it in the DB."""
    _supabase_client = get_supabase_client()
    import uuid
    import time

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    display_name = filename or file.filename
    # Generate unique storage path: user_id/timestamp_uuid.pdf
    unique_id = str(uuid.uuid4())[:8]
    storage_path = f"{user['user_id']}/{int(time.time())}_{unique_id}.pdf"

    try:
        content = await file.read()
        
        # Check if it's a valid text-based PDF
        try:
            import PyPDF2
            import io
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            text_parts = []
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
            extracted_text = "\n".join(text_parts).strip()
            if not extracted_text:
                raise HTTPException(
                    status_code=400, 
                    detail="Please upload a proper text-based PDF. Scanned images are not supported."
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error parsing PDF: {e}")
            raise HTTPException(
                status_code=400, 
                detail="Invalid PDF file. Please upload a proper PDF, not an image."
            )
        
        # Upload to Storage
        def _upload_to_storage(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.storage.from_("resumes").upload(
                path=storage_path,
                file=content,
                file_options={"content-type": "application/pdf"}
            )

        storage_res = await asyncio.to_thread(_upload_to_storage)
        
        # Insert metadata into db with analysis_status = processing
        def _insert_resume_db(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.table("user_resumes").insert({
                "user_id": user["user_id"],
                "filename": display_name,
                "file_path": storage_path,
                "analysis_status": "processing"
            }).execute()

        db_res = await asyncio.to_thread(_insert_resume_db)
        resume_record = db_res.data[0]

        # Fire background AI analysis (non-blocking)
        deepseek_key = settings.DEEPSEEK_API_KEY
        if deepseek_key:
            asyncio.create_task(
                run_resume_analysis(
                    resume_id=resume_record["id"],
                    user_id=user["user_id"],
                    file_path=storage_path,
                    supabase_client=_supabase_client,
                    api_key=deepseek_key,
                )
            )
            logger.info(f"Background resume analysis started for {resume_record['id']}")
        else:
            logger.warning("DEEPSEEK_API_KEY not set, skipping resume analysis")

        return {"success": True, "resume": resume_record}
    except Exception as e:
        logger.error(f"Error uploading resume: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/resumes/{resume_id}")
async def delete_resume(resume_id: str, user: dict = Depends(get_current_user)):
    """Delete a resume from Supabase Storage and DB."""
    _supabase_client = get_supabase_client()
    try:
        # First, get the file path
        def _get_resume_path(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.table("user_resumes") \
                .select("file_path") \
                .eq("id", resume_id) \
                .eq("user_id", user["user_id"]) \
                .execute()

        get_res = await asyncio.to_thread(_get_resume_path)
        
        if not get_res.data:
            raise HTTPException(status_code=404, detail="Resume not found")
            
        file_path = get_res.data[0]["file_path"]

        # Delete from Storage
        def _delete_from_storage(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.storage.from_("resumes").remove([file_path])

        await asyncio.to_thread(_delete_from_storage)

        # Delete from DB
        def _delete_resume_db(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.table("user_resumes") \
                .delete() \
                .eq("id", resume_id) \
                .eq("user_id", user["user_id"]) \
                .execute()

        await asyncio.to_thread(_delete_resume_db)
        
        return {"success": True, "message": "Resume deleted"}
    except Exception as e:
        logger.error(f"Error deleting resume: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/resumes/{resume_id}/analysis")
async def get_resume_analysis(resume_id: str, user: dict = Depends(get_current_user)):
    """Fetch AI analysis results for a specific resume."""
    _supabase_client = get_supabase_client()
    try:
        def _fetch_analysis(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.table("resume_analysis") \
                .select("*") \
                .eq("resume_id", resume_id) \
                .eq("user_id", user["user_id"]) \
                .execute()

        response = await asyncio.to_thread(_fetch_analysis)

        if not response.data:
            # Check if the resume exists and its status
            def _check_status(*args: Any, **kwargs: Any) -> Any:
                return _supabase_client.table("user_resumes") \
                    .select("analysis_status") \
                    .eq("id", resume_id) \
                    .eq("user_id", user["user_id"]) \
                    .execute()

            status_res = await asyncio.to_thread(_check_status)
            if not status_res.data:
                raise HTTPException(status_code=404, detail="Resume not found")

            status = status_res.data[0].get("analysis_status", "pending")
            return {"status": status, "analysis": None}

        analysis = response.data[0]
        # Parse JSON strings back to lists if needed
        import json
        for field in ["education", "certifications", "skills", "project_keywords"]:
            val = analysis.get(field)
            if isinstance(val, str):
                try:
                    analysis[field] = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    analysis[field] = []

        return {"status": "completed", "analysis": analysis}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching resume analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analysis")
