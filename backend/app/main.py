from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
import random
import json as json_module
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional, Any, Dict, List

from app.core.config import get_settings
from app.core.auth import get_current_user
from app.core.supabase_config import (
    get_target_keywords,
    get_blocked_companies,
    get_title_filter_keywords,
    get_all_config,
    set_config_list,
)
from app.services.supabase_jobs import (
    is_already_seen as is_already_seen_sb,
    upsert_job,
    update_job,
    get_all_jobs,
    get_job,
    dismiss_job as dismiss_job_sb,
    delete_jobs_by_company,
    cleanup_expired_jobs,
)
from app.models.custom_source import CustomJobSource
from app.services.custom_source_supabase import (
    get_custom_sources as get_custom_sources_sb,
    add_custom_source as add_custom_source_sb,
    update_custom_source as update_custom_source_sb,
    delete_custom_source as delete_custom_source_sb,
    update_source_status,
    upsert_custom_jobs,
    get_custom_jobs,
    delete_expired_jobs,
)
from app.core.user_manager import (
    UserContext,
    user_registry,
    set_supabase_client,
    get_or_create_user_context,
    load_all_users,
    get_supabase_client,
)
from app.api import websocket
from app.services.scraper_linkedin import fetch_linkedin_jobs
from app.services.scraper_fidelity import fetch_fidelity_jobs
from app.services.scraper_statestreet import fetch_statestreet_jobs
from app.services.scraper_mathworks import fetch_mathworks_jobs
from app.services.scraper_github import fetch_github_jobs

from app.api.websocket import manager, log_manager
from app.services.log_handler import BroadcastLogHandler, get_historical_logs
from app.services.resume_analyzer import enqueue_resume_analysis, process_resume_analysis_queue
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

    # Resume analysis queue table will be created by Supabase migrations if needed
    # The queue processor will handle creating entries in the table

    # Periodic cleanup task for expired scraped jobs
    async def _cleanup_loop():
        while True:
            try:
                await cleanup_expired_jobs(supabase)
            except Exception as e:
                logger.warning(f"Expired job cleanup error: {e}")
            await asyncio.sleep(300)  # every 5 minutes

    cleanup_task = asyncio.create_task(_cleanup_loop())

    # Resume analysis queue processor task
    resume_queue_task = asyncio.create_task(process_resume_analysis_queue(supabase))

    try:
        contexts = await load_all_users()
        for ctx in contexts:
            start_user_scrapers(ctx)
            logger.info(f"Started scrapers for existing user {ctx.user_id}")
    except Exception as e:
        logger.warning(f"Failed to load existing users at startup: {e}. Server will continue.")

    yield

    cleanup_task.cancel()
    resume_queue_task.cancel()
    for ctx in user_registry.values():
        if ctx.hf_task and not ctx.hf_task.done():
            ctx.hf_task.cancel()
        if ctx.lf_task and not ctx.lf_task.done():
            ctx.lf_task.cancel()
        if ctx.analysis_worker_task and not ctx.analysis_worker_task.done():
            ctx.analysis_worker_task.cancel()
        if ctx.custom_sources_task and not ctx.custom_sources_task.done():
            ctx.custom_sources_task.cancel()


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


async def matches_target_keywords(job, supabase, user_id: str) -> bool:
    title_lower = job.title.lower()
    target_keywords = await get_target_keywords(supabase, user_id)
    return any(kw.lower() in title_lower for kw in target_keywords)


async def process_and_alert_jobs(results: Any, ctx: UserContext) -> int:
    supabase = get_supabase_client()
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
        if not await matches_target_keywords(job, supabase, ctx.user_id):
            continue
        if await is_already_seen_sb(supabase, ctx.user_id, job.source, job.external_id):
            continue

        job_dict = job.model_dump(mode="json")
        job_dict["visible"] = False
        await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
        total_finds = total_finds + 1  # type: ignore

        if job.source == "LinkedIn" and settings.DEEPSEEK_API_KEY:
            # Push to in-memory analysis queue
            await ctx.analysis_queue.put({
                "external_id": job_dict["external_id"],
                "job_url": job_dict["url"],
                "source": job_dict["source"],
                "retry_count": 0,
            })
            logger.info(f"Queued job {job_dict['external_id']} for analysis")
        else:
            job_dict["visible"] = True
            await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
            await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
            job_dict["is_notified"] = True
            await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
            logger.info(f"New Target: {job.title} @ {job.company} ({job.location})")

    for job in fidelity_jobs:
        if await is_already_seen_sb(supabase, ctx.user_id, job.source, job.external_id):
            continue
        job_dict = job.model_dump(mode="json")
        job_dict["visible"] = True
        await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=FIDELITY_TTL_SECONDS)
        total_finds = total_finds + 1
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        job_dict["is_notified"] = True
        await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=FIDELITY_TTL_SECONDS)
        logger.info(f"New Target (Fidelity): {job.title} @ {job.company}")

    for job in statestreet_jobs:
        if await is_already_seen_sb(supabase, ctx.user_id, job.source, job.external_id):
            continue
        job_dict = job.model_dump(mode="json")
        job_dict["visible"] = True
        await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
        total_finds = total_finds + 1
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        job_dict["is_notified"] = True
        await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
        logger.info(f"New Target (StateStreet): {job.title} @ {job.company}")

    for job in mathworks_jobs:
        if await is_already_seen_sb(supabase, ctx.user_id, job.source, job.external_id):
            continue
        job_dict = job.model_dump(mode="json")
        job_dict["visible"] = True
        await upsert_job(supabase, ctx.user_id, job_dict)  # permanent — no TTL
        total_finds = total_finds + 1
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        job_dict["is_notified"] = True
        await upsert_job(supabase, ctx.user_id, job_dict)
        logger.info(f"New Target (MathWorks): {job.title} @ {job.company}")

    for job in github_jobs:
        if not await matches_target_keywords(job, supabase, ctx.user_id):
            continue
        if await is_already_seen_sb(supabase, ctx.user_id, job.source, job.external_id):
            continue
        job_dict = job.model_dump(mode="json")
        job_dict["visible"] = True
        await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=GITHUB_TTL_SECONDS)
        total_finds = total_finds + 1  # type: ignore
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        job_dict["is_notified"] = True
        await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=GITHUB_TTL_SECONDS)
        logger.info(f"New Target (GitHub): {job.title} @ {job.company}")

    return total_finds


# ---------------------------------------------------------------------------
# Analysis Worker — asyncio.Queue loop with retries
# ---------------------------------------------------------------------------
ANALYSIS_MAX_RETRIES = 2

async def run_analysis_worker(ctx: UserContext):
    """
    Continuously takes jobs from the in-memory analysis queue, runs DeepSeek analysis,
    and broadcasts results directly via WebSocket. Retries up to ANALYSIS_MAX_RETRIES
    times on failure before marking the job as analysis_unavailable.
    """
    supabase = get_supabase_client()
    logger.info(f"[AnalysisWorker] Started for user {ctx.user_id}")

    while True:
        try:
            # Await next item from the in-memory queue
            try:
                task = await asyncio.wait_for(ctx.analysis_queue.get(), timeout=5)
            except asyncio.TimeoutError:
                continue

            external_id = task["external_id"]
            job_url = task["job_url"]
            source = task.get("source", "LinkedIn")
            retry_count = task.get("retry_count", 0)

            logger.info(
                f"[AnalysisWorker] Processing {external_id} "
                f"(attempt {retry_count + 1}/{ANALYSIS_MAX_RETRIES + 1})"
            )

            # Load the current job from Supabase
            job_dict = await get_job(supabase, ctx.user_id, source, external_id)
            if not job_dict:
                logger.warning(f"[AnalysisWorker] Job {external_id} not found in Supabase, skipping.")
                continue

            try:
                analysis_data = await run_job_analysis(
                    external_id=external_id,
                    job_url=job_url,
                    api_key=settings.DEEPSEEK_API_KEY,
                )

                if analysis_data:
                    if analysis_data.get("compensation"):
                        job_dict["salary"] = analysis_data["compensation"]
                    if analysis_data.get("visa_status"):
                        job_dict["visa"] = analysis_data["visa_status"]
                    job_dict["analysis"] = analysis_data
                    job_dict["analysis_status"] = "completed"
                else:
                    raise ValueError("run_job_analysis returned None")

            except Exception as e:
                logger.warning(
                    f"[AnalysisWorker] Analysis failed for {external_id} "
                    f"(attempt {retry_count + 1}): {e}"
                )
                if retry_count < ANALYSIS_MAX_RETRIES:
                    # Re-queue with incremented retry count
                    task["retry_count"] = retry_count + 1
                    await ctx.analysis_queue.put(task)
                    logger.info(
                        f"[AnalysisWorker] Re-queued {external_id} "
                        f"for retry {retry_count + 2}/{ANALYSIS_MAX_RETRIES + 1}"
                    )
                    continue
                else:
                    # Hard fail — post without analysis
                    logger.error(
                        f"[AnalysisWorker] Hard fail for {external_id} after "
                        f"{ANALYSIS_MAX_RETRIES + 1} attempts. Posting without analysis."
                    )
                    job_dict["analysis_status"] = "unavailable"

            # Check blocked companies before making visible
            blocked_companies = await get_blocked_companies(supabase, ctx.user_id)
            job_company = (job_dict.get("company") or "").lower()
            if any(b.lower() in job_company for b in blocked_companies):
                logger.info(
                    f"[AnalysisWorker] Skipping {external_id} — company "
                    f"'{job_dict.get('company')}' is blocked."
                )
                continue

            # Make visible and persist in Supabase
            job_dict["visible"] = True
            updates = {
                "visible": True,
                "analysis_status": job_dict.get("analysis_status"),
                "analysis": job_dict.get("analysis"),
                "salary": job_dict.get("salary"),
                "visa": job_dict.get("visa"),
            }
            await update_job(supabase, ctx.user_id, source, external_id, updates)

            # Broadcast directly via WebSocket (no Pub/Sub needed)
            await manager.broadcast(ctx.user_id, {
                "type": "NEW_JOB",
                "data": job_dict,
            })

            await update_job(supabase, ctx.user_id, source, external_id, {"is_notified": True})

            status = job_dict.get("analysis_status", "unknown")
            logger.info(f"[AnalysisWorker] Done {external_id} — status={status}")

        except asyncio.CancelledError:
            logger.info(f"[AnalysisWorker] Cancelled for user {ctx.user_id}")
            break
        except Exception as e:
            logger.error(f"[AnalysisWorker] Unexpected error: {e}")
            await asyncio.sleep(2)

async def run_high_frequency_loop(ctx: UserContext):
    supabase = get_supabase_client()
    logger.info(f"[HF] Scraper started for {ctx.user_id}")
    while True:
        try:
            target_keywords = await get_target_keywords(supabase, ctx.user_id)
            results = await asyncio.gather(
                *[
                    fetch_linkedin_jobs(supabase, ctx.user_id, keywords=kw, location="United States")
                    for kw in target_keywords
                ],
                fetch_statestreet_jobs(supabase, ctx.user_id),
            )
            total = len(results)
            failed = sum(1 for r in results if r["failed"])
            logger.info(
                f"[HF] {ctx.user_id} | {total} calls | "
                f"{total - failed} passed | {failed} failed"
            )
            new_finds = await process_and_alert_jobs(results, ctx)
            if new_finds == 0:
                logger.debug(f"[HF] {ctx.user_id} No new targets.")
        except Exception as e:
            logger.error(f"[HF] {ctx.user_id} Error: {e}")
        await asyncio.sleep(90 + random.uniform(-10, 10))


async def run_low_frequency_loop(ctx: UserContext):
    supabase = get_supabase_client()
    logger.info(f"[LF] Scraper started for {ctx.user_id}")
    while True:
        try:
            results = await asyncio.gather(
                fetch_fidelity_jobs(supabase, ctx.user_id),
                fetch_mathworks_jobs(supabase, ctx.user_id),
                fetch_github_jobs(supabase, ctx.user_id),
            )
            total = len(results)
            failed = sum(1 for r in results if r["failed"])
            logger.info(
                f"[LF] {ctx.user_id} | {total} calls | "
                f"{total - failed} passed | {failed} failed"
            )
            new_finds = await process_and_alert_jobs(results, ctx)
            if new_finds == 0:
                logger.debug(f"[LF] {ctx.user_id} No new targets.")
        except Exception as e:
            logger.error(f"[LF] {ctx.user_id} Error: {e}")
        await asyncio.sleep(1200 + random.uniform(-30, 30))


async def run_custom_sources_loop(ctx: UserContext):
    logger.info(f"[Custom] Scraper started for {ctx.user_id}")
    supabase = get_supabase_client()
    last_scraped: dict[str, datetime] = {}
    cleanup_counter = 0

    while True:
        try:
            from app.models.custom_source import CustomJobSource
            from app.services.scraper_custom import fetch_custom_jobs

            custom_sources = await get_custom_sources_sb(supabase, ctx.user_id)
            if not custom_sources:
                await asyncio.sleep(60)
                continue

            now = datetime.now(timezone.utc)

            for src_row in custom_sources:
                source = CustomJobSource(**{
                    "id": src_row["id"],
                    "name": src_row["name"],
                    "icon": src_row["icon"],
                    "url": src_row["url"],
                    "ttl_hours": src_row.get("ttl_hours", 24),
                    "interval_minutes": src_row.get("interval_minutes", 60),
                })

                # Inherit last_scraped_at from DB if memory dictionary is missing it (e.g. after reload)
                if source.id not in last_scraped and src_row.get("last_scraped_at"):
                    try:
                        # Supabase isoformat parser
                        last_scraped[source.id] = datetime.fromisoformat(src_row["last_scraped_at"].replace("Z", "+00:00"))
                    except Exception as e:
                        logger.warning(f"Failed to parse last_scraped_at for {source.id}: {e}")

                # Determine if we should scrape this source now
                should_scrape = False
                if source.id not in last_scraped:
                    should_scrape = True
                else:
                    elapsed = (now - last_scraped[source.id]).total_seconds()
                    if elapsed >= source.interval_minutes * 60:
                        should_scrape = True
                # Also scrape if status is 'pending' (newly added source)
                if src_row.get("status") == "pending":
                    should_scrape = True

                if not should_scrape:
                    continue

                # --- Status: fetching ---
                await update_source_status(
                    supabase, source.id, ctx.user_id,
                    "fetching", "Fetching page content..."
                )
                # Status callback for real-time updates inside fetcher
                async def _status_cb(status, msg):
                    await update_source_status(supabase, source.id, ctx.user_id, status, msg)
                    await manager.broadcast(ctx.user_id, {
                        "type": "CUSTOM_SOURCE_STATUS",
                        "data": {"source_id": source.id, "status": status, "message": msg}
                    })

                result = await fetch_custom_jobs(source, supabase, status_callback=_status_cb)
                last_scraped[source.id] = now

                if result.get("failed"):
                    await update_source_status(
                        supabase, source.id, ctx.user_id,
                        "error", "Failed to fetch page."
                    )
                    await manager.broadcast(ctx.user_id, {
                        "type": "CUSTOM_SOURCE_STATUS",
                        "data": {"source_id": source.id, "status": "error",
                                 "message": "Failed to fetch page."}
                    })
                    continue

                # --- Status: parsing already handled by callback inside fetcher ---
                parsed_jobs = result.get("jobs", [])
                job_dicts = [j.model_dump(mode="json") for j in parsed_jobs]

                # Store jobs in Supabase
                new_jobs = await upsert_custom_jobs(
                    supabase, ctx.user_id, source.id, source.name, job_dicts
                )

                # --- Status: done ---
                msg = f"Found {len(parsed_jobs)} jobs."
                await update_source_status(
                    supabase, source.id, ctx.user_id,
                    "done", msg, set_last_scraped=True,
                )
                await manager.broadcast(ctx.user_id, {
                    "type": "CUSTOM_SOURCE_STATUS",
                    "data": {"source_id": source.id, "status": "done",
                             "message": msg}
                })

                # Broadcast each new job to the frontend
                for job_row in new_jobs:
                    job_ws = {
                        "title": job_row.get("title", ""),
                        "company": job_row.get("company", ""),
                        "location": job_row.get("location", ""),
                        "url": job_row.get("url", ""),
                        "source": job_row.get("source_name", source.name),
                        "external_id": job_row.get("external_id", ""),
                        "posted_at": job_row.get("posted_at", ""),
                        "visible": True,
                    }
                    await manager.broadcast(ctx.user_id, {
                        "type": "NEW_JOB", "data": job_ws
                    })

                logger.info(
                    f"[Custom] {source.name}: scraped {len(parsed_jobs)} jobs, "
                    f"{len(new_jobs)} upserted"
                )

            # Periodic cleanup of expired jobs (every 10 iterations ≈ 10 min)
            cleanup_counter += 1
            if cleanup_counter >= 10:
                await delete_expired_jobs(supabase)
                cleanup_counter = 0

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"[Custom] Error for {ctx.user_id}: {e}")

        await asyncio.sleep(60)


def start_user_scrapers(ctx: UserContext) -> None:
    """Start HF and LF scraper tasks for a user if they aren't already running."""
    # Ensure we don't start them multiple times due to race conditions
    if getattr(ctx, "_scrapers_started", False):
        return

    if ctx.hf_task is None or ctx.hf_task.done():
        ctx.hf_task = asyncio.create_task(run_high_frequency_loop(ctx))
    if ctx.lf_task is None or ctx.lf_task.done():
        ctx.lf_task = asyncio.create_task(run_low_frequency_loop(ctx))
    if ctx.analysis_worker_task is None or ctx.analysis_worker_task.done():
        ctx.analysis_worker_task = asyncio.create_task(run_analysis_worker(ctx))
    if getattr(ctx, "custom_sources_task", None) is None or ctx.custom_sources_task.done():
        ctx.custom_sources_task = asyncio.create_task(run_custom_sources_loop(ctx))
    
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
    }

@app.get("/jobs")
async def get_jobs_endpoint(ctx: UserContext = Depends(_get_ctx)):
    supabase = get_supabase_client()
    blocked_companies = await get_blocked_companies(supabase, ctx.user_id)
    blocked_lower = [b.lower() for b in blocked_companies]
    try:
        # Fetch all visible scraped jobs from Supabase
        all_scraped = await get_all_jobs(supabase, ctx.user_id)
        jobs = []
        for job_data in all_scraped:
            company = (job_data.get("company") or "").lower()
            if any(b in company for b in blocked_lower):
                continue
            jobs.append(job_data)
    except Exception as e:
        logger.error(f"Error fetching jobs from Supabase: {e}")
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    # --- Merge custom-source jobs from Supabase ---
    try:
        custom_jobs = await get_custom_jobs(supabase, ctx.user_id)
        for cj in custom_jobs:
            company = (cj.get("company") or "").lower()
            if any(b in company for b in blocked_lower):
                continue
            jobs.append({
                "title": cj.get("title", ""),
                "company": cj.get("company", ""),
                "location": cj.get("location", ""),
                "url": cj.get("url", ""),
                "source": cj.get("source_name", ""),
                "external_id": cj.get("external_id", ""),
                "posted_at": cj.get("posted_at", ""),
                "visible": True,
                "ttl": -1,
            })
    except Exception as e:
        logger.warning(f"Failed to fetch custom jobs from Supabase: {e}")

    jobs.sort(key=lambda x: x.get("posted_at") or "", reverse=True)
    return {"jobs": jobs, "count": len(jobs)}


class ConfigUpdateRequest(BaseModel):
    values: list[str]


@app.get("/config")
async def get_config(ctx: UserContext = Depends(_get_ctx)):
    supabase = get_supabase_client()
    return await get_all_config(supabase, ctx.user_id)


@app.get("/config/target-keywords")
async def get_target_keywords_endpoint(ctx: UserContext = Depends(_get_ctx)):
    supabase = get_supabase_client()
    keywords = await get_target_keywords(supabase, ctx.user_id)
    return {"target_keywords": keywords, "count": len(keywords)}


@app.put("/config/target-keywords")
async def update_target_keywords(
    request: ConfigUpdateRequest, ctx: UserContext = Depends(_get_ctx)
):
    supabase = get_supabase_client()
    success = await set_config_list(supabase, ctx.user_id, "target_keywords", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "target_keywords": request.values}


@app.get("/config/target-locations")
async def get_target_locations_endpoint(ctx: UserContext = Depends(_get_ctx)):
    from app.core.supabase_config import get_target_locations
    supabase = get_supabase_client()
    locations = await get_target_locations(supabase, ctx.user_id)
    return {"target_locations": locations, "count": len(locations)}


@app.put("/config/target-locations")
async def update_target_locations(
    request: ConfigUpdateRequest, ctx: UserContext = Depends(_get_ctx)
):
    supabase = get_supabase_client()
    success = await set_config_list(supabase, ctx.user_id, "target_locations", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "target_locations": request.values}


@app.get("/config/blocked-companies")
async def get_blocked_companies_endpoint(ctx: UserContext = Depends(_get_ctx)):
    supabase = get_supabase_client()
    companies = await get_blocked_companies(supabase, ctx.user_id)
    return {"blocked_companies": companies, "count": len(companies)}


@app.put("/config/blocked-companies")
async def update_blocked_companies(
    request: ConfigUpdateRequest, ctx: UserContext = Depends(_get_ctx)
):
    supabase = get_supabase_client()
    success = await set_config_list(supabase, ctx.user_id, "blocked_companies", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "blocked_companies": request.values}


@app.get("/config/title-filter-keywords")
async def get_title_filter_keywords_endpoint(ctx: UserContext = Depends(_get_ctx)):
    supabase = get_supabase_client()
    keywords = await get_title_filter_keywords(supabase, ctx.user_id)
    return {"title_filter_keywords": keywords, "count": len(keywords)}


@app.put("/config/title-filter-keywords")
async def update_title_filter_keywords(
    request: ConfigUpdateRequest, ctx: UserContext = Depends(_get_ctx)
):
    supabase = get_supabase_client()
    success = await set_config_list(supabase, ctx.user_id, "title_filter_keywords", request.values)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update config")
    return {"message": "Updated", "title_filter_keywords": request.values}


class CustomSourceRequest(BaseModel):
    source: CustomJobSource


@app.get("/config/custom-sources")
async def get_custom_sources_endpoint(ctx: UserContext = Depends(_get_ctx)):
    supabase = get_supabase_client()
    sources = await get_custom_sources_sb(supabase, ctx.user_id)
    return {"custom_sources": sources, "count": len(sources)}


@app.post("/config/custom-sources")
async def add_custom_source(
    request: CustomSourceRequest, ctx: UserContext = Depends(_get_ctx)
):
    supabase = get_supabase_client()
    sources = await get_custom_sources_sb(supabase, ctx.user_id)

    # Check if exists
    if any(s.get("id") == request.source.id for s in sources):
        raise HTTPException(status_code=400, detail="Custom source with this ID already exists")

    source_data = request.source.model_dump(mode="json")
    await add_custom_source_sb(supabase, ctx.user_id, source_data)

    # Broadcast pending status so frontend shows loading bar immediately
    await manager.broadcast(ctx.user_id, {
        "type": "CUSTOM_SOURCE_STATUS",
        "data": {"source_id": request.source.id, "status": "pending",
                 "message": "Waiting to start..."}
    })

    updated_sources = await get_custom_sources_sb(supabase, ctx.user_id)
    return {"message": "Added custom source", "custom_sources": updated_sources}


@app.put("/config/custom-sources/{source_id}")
async def update_custom_source(
    source_id: str, request: CustomSourceRequest, ctx: UserContext = Depends(_get_ctx)
):
    supabase = get_supabase_client()
    sources = await get_custom_sources_sb(supabase, ctx.user_id)

    if not any(s.get("id") == source_id for s in sources):
        raise HTTPException(status_code=404, detail="Custom source not found")

    source_data = request.source.model_dump(mode="json")
    source_data["id"] = source_id
    await update_custom_source_sb(supabase, ctx.user_id, source_id, source_data)

    updated_sources = await get_custom_sources_sb(supabase, ctx.user_id)
    return {"message": "Updated custom source", "custom_sources": updated_sources}


@app.delete("/config/custom-sources/{source_id}")
async def delete_custom_source(
    source_id: str, ctx: UserContext = Depends(_get_ctx)
):
    supabase = get_supabase_client()
    sources = await get_custom_sources_sb(supabase, ctx.user_id)

    if not any(s.get("id") == source_id for s in sources):
        raise HTTPException(status_code=404, detail="Custom source not found")

    success = await delete_custom_source_sb(supabase, ctx.user_id, source_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete custom source")

    updated_sources = await get_custom_sources_sb(supabase, ctx.user_id)
    return {"message": "Deleted custom source", "custom_sources": updated_sources}


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
    supabase = get_supabase_client()
    try:
        blocked_companies = await get_blocked_companies(supabase, ctx.user_id)
        if request.company not in blocked_companies:
            blocked_companies.append(request.company)
            await set_config_list(supabase, ctx.user_id, "blocked_companies", blocked_companies)

        deleted_job_ids = await delete_jobs_by_company(supabase, ctx.user_id, request.company)

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
async def dismiss_job_endpoint(request: DismissJobRequest, ctx: UserContext = Depends(_get_ctx)):
    supabase = get_supabase_client()
    try:
        await dismiss_job_sb(supabase, ctx.user_id, request.source, request.external_id)

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

    async def _save_with_retry(max_retries: int = 3) -> dict:
        """Save a job with exponential backoff retry logic."""
        for attempt in range(max_retries):
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
                # Don't retry on duplicate constraint error
                if "duplicate key value violates unique constraint" in str(e).lower():
                    return {"success": True, "message": "Job already saved"}

                if attempt < max_retries - 1:
                    wait_time = 0.5 * (2 ** attempt)
                    logger.warning(f"Save attempt {attempt + 1} failed, retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"Error saving job after {max_retries} attempts: {e}")
                    raise HTTPException(status_code=500, detail="Failed to save job")

    return await _save_with_retry()


@app.get("/jobs/saved")
async def get_saved_jobs(user: dict = Depends(get_current_user)):
    _supabase_client = get_supabase_client()

    async def _fetch_with_retry(max_retries: int = 3) -> dict:
        """Fetch saved jobs with exponential backoff retry logic."""
        for attempt in range(max_retries):
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
                if attempt < max_retries - 1:
                    # Exponential backoff: 0.5s, 1s, 2s
                    wait_time = 0.5 * (2 ** attempt)
                    logger.warning(f"Attempt {attempt + 1} failed, retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"Error fetching saved jobs after {max_retries} attempts: {e}")
                    raise HTTPException(status_code=500, detail="Failed to fetch saved jobs")

    return await _fetch_with_retry()


@app.delete("/jobs/saved/{external_id}")
async def unsave_job(external_id: str, user: dict = Depends(get_current_user)):
    _supabase_client = get_supabase_client()

    async def _unsave_with_retry(max_retries: int = 3) -> dict:
        """Unsave a job with exponential backoff retry logic."""
        for attempt in range(max_retries):
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
                if attempt < max_retries - 1:
                    wait_time = 0.5 * (2 ** attempt)
                    logger.warning(f"Unsave attempt {attempt + 1} failed, retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"Error unsaving job after {max_retries} attempts: {e}")
                    raise HTTPException(status_code=500, detail="Failed to unsave job")

    return await _unsave_with_retry()


@app.get("/jobs/{external_id}/analysis")
async def get_job_analysis(external_id: str, ctx: UserContext = Depends(_get_ctx)):
    """Fetch pre-computed AI analysis for a job posting. Returns cached result only."""
    supabase = get_supabase_client()
    try:
        # Check scraped_jobs table for analysis
        job_data = await get_job(supabase, ctx.user_id, "LinkedIn", external_id)
        if job_data and job_data.get("analysis"):
            return {"status": "completed", "analysis": job_data["analysis"]}

        if job_data and job_data.get("analysis_status") == "unavailable":
            return {"status": "unavailable", "analysis": None}

        # Not available yet — analysis may still be in progress
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

        # Enqueue AI analysis for background processing
        # API key is retrieved from environment at processing time (never stored in database)
        await enqueue_resume_analysis(
            resume_id=resume_record["id"],
            user_id=user["user_id"],
            file_path=storage_path,
            supabase_client=_supabase_client,
        )
        logger.info(f"Resume analysis queued for {resume_record['id']}")

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
