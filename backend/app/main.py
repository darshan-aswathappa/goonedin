from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
import random
import time as _time
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional, Any, List

from app.core.config import get_settings
from app.core.auth import get_current_user
from app.core.context_vars import current_user_id
from app.core.supabase_config import (
    get_target_keywords,
    get_target_locations,
    get_blocked_companies,
    get_title_filter_keywords,
    get_all_config,
    set_config_list,
    get_location_filter,
    set_location_filter,
)
from app.core.title_filter import is_title_blocked
from app.core.location_map import normalize_location
from app.services.supabase_jobs import (
    is_already_seen as is_already_seen_sb,
    upsert_job,
    insert_job_if_new,
    update_job,
    get_all_jobs,
    get_job,
    dismiss_job as dismiss_job_sb,
    delete_jobs_by_company,
    hide_jobs_by_title_keywords,
    cleanup_expired_jobs,
    cleanup_old_invisible_jobs,
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
    dismiss_custom_job,
    cleanup_old_invisible_custom_jobs,
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
from app.services.scraper_mathworks import fetch_mathworks_jobs
from app.services.scraper_github import fetch_github_jobs
from app.services.scraper_jobright import fetch_jobright_jobs
import httpx
from app.services.scraper_indeed import fetch_indeed_jobs
from app.services.greenhouse_crawler import run_greenhouse_crawler
from app.services.greenhouse_jobs import get_jobs_since
from app.services.greenhouse_match import location_matches
from app.services.scraper_greenhouse import ParsedJob  # noqa: F401 (type ref)
from app.models.job import JobCreate

from app.api.websocket import manager, log_manager
from app.services.log_handler import BroadcastLogHandler, get_historical_logs
from app.services.resume_analyzer import enqueue_resume_analysis, process_resume_analysis_queue
from app.services.job_analyzer import run_job_analysis
from app.services.job_queue import get_cache_entry, create_cache_entry, enqueue_job
from app.services.job_queue_worker import process_job_analysis_queue, store_description
from app.api.knowledge_base import router as kb_router
from app.services.jobright_credentials import get_jobright_credentials
from app.api.jobright_config import router as jobright_config_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VelocityMain")

broadcast_handler = BroadcastLogHandler(log_manager.broadcast)
broadcast_handler.setLevel(logging.INFO)
for _logger_name in ("VelocityMain", "VelocityScraper"):
    _named_logger = logging.getLogger(_logger_name)
    if not any(isinstance(h, BroadcastLogHandler) for h in _named_logger.handlers):
        _named_logger.addHandler(broadcast_handler)

settings = get_settings()

JOB_RECENCY_MINUTES = 600
SEEN_JOB_TTL_SECONDS = 60 * 60 * 2
GITHUB_TTL_SECONDS = 24 * 60 * 60
INDEED_TTL_SECONDS = 60 * 60 * 2  # 2 hours
GREENHOUSE_TTL_SECONDS = 24 * 60 * 60  # 24 hours (batch-discovered, like GitHub)

# ── In-memory dedup for LinkedIn jobs ──────────────────────────────
# Maps user_id → {external_id: timestamp_added}
# Avoids Supabase round-trips for jobs already processed this session.
_seen_linkedin: dict[str, dict[str, float]] = {}

def _is_seen(user_id: str, external_id: str) -> bool:
    return external_id in _seen_linkedin.get(user_id, {})

def _mark_seen(user_id: str, external_id: str):
    _seen_linkedin.setdefault(user_id, {})[external_id] = _time.monotonic()

def _prune_seen(max_age: float = SEEN_JOB_TTL_SECONDS):
    """Remove entries older than max_age seconds."""
    now = _time.monotonic()
    for uid in list(_seen_linkedin):
        entries = _seen_linkedin[uid]
        stale = [eid for eid, ts in entries.items() if now - ts > max_age]
        for eid in stale:
            del entries[eid]
        if not entries:
            del _seen_linkedin[uid]

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
                await cleanup_expired_jobs(supabase)               # soft-delete expired scraped_jobs
                await cleanup_old_invisible_jobs(supabase)         # hard-delete 60d+ invisible scraped_jobs
                await cleanup_old_invisible_custom_jobs(supabase)  # hard-delete 60d+ invisible custom jobs
                _prune_seen()                                      # evict stale in-memory dedup entries
            except Exception as e:
                logger.warning(f"Expired job cleanup error: {e}")
            await asyncio.sleep(300)  # every 5 minutes

    cleanup_task = asyncio.create_task(_cleanup_loop())

    # Resume analysis queue processor task
    resume_queue_task = asyncio.create_task(process_resume_analysis_queue(supabase))

    # Job analysis queue processor task (global, handles all users)
    job_queue_task = asyncio.create_task(process_job_analysis_queue(supabase))

    # Global Greenhouse crawler (single task, fills the shared greenhouse_jobs pool)
    greenhouse_crawler_task = asyncio.create_task(run_greenhouse_crawler(supabase))

    # Start knowledge base embedding backfill (runs in background, non-blocking)
    from app.services.knowledge_base_service import backfill_embeddings, close_pool
    asyncio.create_task(backfill_embeddings(supabase))

    from app.services.knowledge_base.conversation_memory import start_cleanup_task
    start_cleanup_task()

    # Fetch live database schema for AI query layer (non-blocking)
    from app.services.knowledge_base.schema_introspection import refresh_schema_cache
    asyncio.create_task(refresh_schema_cache())

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
    job_queue_task.cancel()
    greenhouse_crawler_task.cancel()
    for ctx in user_registry.values():
        if ctx.hf_task and not ctx.hf_task.done():
            ctx.hf_task.cancel()
        if ctx.lf_task and not ctx.lf_task.done():
            ctx.lf_task.cancel()
        if ctx.custom_sources_task and not ctx.custom_sources_task.done():
            ctx.custom_sources_task.cancel()
        if ctx.location_task and not ctx.location_task.done():
            ctx.location_task.cancel()
        if getattr(ctx, "greenhouse_task", None) and not ctx.greenhouse_task.done():
            ctx.greenhouse_task.cancel()

    # Gracefully close the asyncpg read-only pool used by the knowledge base
    await close_pool()


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
app.include_router(kb_router)
app.include_router(jobright_config_router)

@app.get("/api/health")
async def health():
    return {"status": "ok"}

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
    # Fetch keywords ONCE to avoid redundant DB calls per job
    target_keywords = await get_target_keywords(supabase, ctx.user_id)
    target_keywords_lower = [kw.lower() for kw in target_keywords]
    all_jobs: List[Any] = []
    jobright_jobs: List[Any] = []
    mathworks_jobs: List[Any] = []
    github_jobs: List[Any] = []
    indeed_jobs: List[Any] = []
    indeed_descriptions: dict[str, str] = {}
    greenhouse_jobs: List[Any] = []

    for r in results:
        if isinstance(r, dict) and "jobs" in r:
            # Check if this payload has 'recent_jobs' specific structure
            if "recent_jobs" in r and r["recent_jobs"]:
                first_job = r["recent_jobs"][0]
                if first_job.source == "MathWorks":
                    mathworks_jobs.extend(r["recent_jobs"])
                elif first_job.source == "GitHub":
                    github_jobs.extend(r["recent_jobs"])
                else:
                    all_jobs.extend(r["jobs"])
            elif "jobs" in r and r["jobs"]:
                first_job = r["jobs"][0]
                if hasattr(first_job, "source") and first_job.source == "Jobright":
                    jobright_jobs.extend(r["jobs"])
                elif hasattr(first_job, "source") and first_job.source == "Indeed":
                    indeed_jobs.extend(r["jobs"])
                    indeed_descriptions.update(r.get("descriptions", {}))
                elif hasattr(first_job, "source") and first_job.source == "Greenhouse":
                    greenhouse_jobs.extend(r["jobs"])
                else:
                    all_jobs.extend(r["jobs"])
        elif isinstance(r, Exception):
            logger.error(f"Task exception in HF loop: {r}")

    total_finds: int = 0

    for job in all_jobs:
        if not is_recent(job.posted_at):
            continue

        # In-memory dedup: skip jobs already processed this session (avoids DB round-trips)
        if _is_seen(ctx.user_id, job.external_id):
            continue

        title_lower = job.title.lower()
        if not any(kw in title_lower for kw in target_keywords_lower):
            _mark_seen(ctx.user_id, job.external_id)  # remember non-matching jobs too
            continue

        job_dict = job.model_dump(mode="json")

        if job.source == "LinkedIn" and settings.DEEPSEEK_API_KEY:
            # Check if analysis already cached
            cache = await get_cache_entry(supabase, job_dict["external_id"])
            if cache and cache["analysis_status"] == "completed":
                # Reuse cached analysis — no API call needed
                job_dict["analysis"] = cache["analysis"]
                job_dict["analysis_status"] = "completed"
                job_dict["salary"] = cache.get("salary")
                job_dict["visa"] = cache.get("visa")
                job_dict["min_exp"] = cache.get("min_exp")
                job_dict["visible"] = True
                inserted = await insert_job_if_new(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
                _mark_seen(ctx.user_id, job.external_id)
                if inserted is None:
                    continue  # already exists (possibly dismissed)
                total_finds = total_finds + 1  # type: ignore
                await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
                job_dict["is_notified"] = True
                await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
                logger.info(f"New Target (cached analysis): {job.title} @ {job.company} ({job.location})")
            else:
                # Queue for analysis
                await create_cache_entry(supabase, job_dict["external_id"], job_dict["url"])
                await enqueue_job(supabase, job_dict["external_id"], job_dict["url"])
                job_dict["visible"] = False
                inserted = await insert_job_if_new(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
                _mark_seen(ctx.user_id, job.external_id)
                if inserted is None:
                    continue  # already exists
                total_finds = total_finds + 1  # type: ignore
                logger.info(f"Queued job {job_dict['external_id']} for analysis")
        else:
            job_dict["visible"] = True
            inserted = await insert_job_if_new(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
            _mark_seen(ctx.user_id, job.external_id)
            if inserted is None:
                continue  # already exists (possibly dismissed)
            total_finds = total_finds + 1  # type: ignore
            await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
            job_dict["is_notified"] = True
            await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
            logger.info(f"New Target: {job.title} @ {job.company} ({job.location})")

    for job in mathworks_jobs:
        job_dict = job.model_dump(mode="json")
        job_dict["visible"] = True
        inserted = await insert_job_if_new(supabase, ctx.user_id, job_dict)  # permanent — no TTL
        if inserted is None:
            continue  # already exists (possibly dismissed)
        total_finds = total_finds + 1
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        job_dict["is_notified"] = True
        await upsert_job(supabase, ctx.user_id, job_dict)
        logger.info(f"New Target (MathWorks): {job.title} @ {job.company}")

    for job in github_jobs:
        if not any(kw in job.title.lower() for kw in target_keywords_lower):
            continue
        job_dict = job.model_dump(mode="json")
        job_dict["visible"] = True
        inserted = await insert_job_if_new(supabase, ctx.user_id, job_dict, ttl_seconds=GITHUB_TTL_SECONDS)
        if inserted is None:
            continue  # already exists (possibly dismissed)
        total_finds = total_finds + 1  # type: ignore
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        job_dict["is_notified"] = True
        await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=GITHUB_TTL_SECONDS)
        logger.info(f"New Target (GitHub): {job.title} @ {job.company}")

    # Build a lookup of analyses from Jobright results
    jobright_analyses: dict = {}
    for r in results:
        if isinstance(r, dict) and r.get("analyses"):
            jobright_analyses.update(r["analyses"])

    logger.info(f"[Jobright] Processing {len(jobright_jobs)} jobs (no keyword filter — personalized feed)")
    for job in jobright_jobs:
        job_dict = job.model_dump(mode="json")

        # Attach pre-built analysis from Jobright API data
        analysis = jobright_analyses.get(job.external_id)
        if analysis:
            job_dict["analysis"] = analysis
            job_dict["analysis_status"] = "completed"

        job_dict["visible"] = True
        # Use insert_job_if_new so duplicate external_ids are silently skipped —
        # they won't overwrite dismissed rows and won't re-appear on the UI.
        inserted = await insert_job_if_new(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
        if inserted is None:
            continue  # duplicate — already in DB, do not show on UI
        total_finds = total_finds + 1
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        job_dict["is_notified"] = True
        await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=SEEN_JOB_TTL_SECONDS)
        logger.info(f"New Target (Jobright): {job.title} @ {job.company}")

    # ── Indeed jobs: no analysis needed — salary/location/title from API ──
    for job in indeed_jobs:
        if _is_seen(ctx.user_id, job.external_id):
            continue

        title_lower = job.title.lower()
        if not any(kw in title_lower for kw in target_keywords_lower):
            _mark_seen(ctx.user_id, job.external_id)
            continue

        job_dict = job.model_dump(mode="json")
        job_dict["visible"] = True
        inserted = await insert_job_if_new(supabase, ctx.user_id, job_dict, ttl_seconds=INDEED_TTL_SECONDS)
        _mark_seen(ctx.user_id, job.external_id)
        if inserted is None:
            continue
        total_finds += 1
        await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
        job_dict["is_notified"] = True
        await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=INDEED_TTL_SECONDS)
        logger.info(f"New Target (Indeed): {job.title} @ {job.company} | salary={job_dict.get('salary')}")

    # ── Greenhouse jobs: mirror the LinkedIn analysis path. Freshness and
    #    keyword/location filtering already happened (crawl + matcher), so no
    #    is_recent gate here. The crawler pre-stored the description and enqueued
    #    analysis; the calls below are idempotent for any not-yet-analyzed job. ──
    for job in greenhouse_jobs:
        if _is_seen(ctx.user_id, job.external_id):
            continue

        job_dict = job.model_dump(mode="json")

        if settings.DEEPSEEK_API_KEY:
            cache = await get_cache_entry(supabase, job_dict["external_id"])
            if cache and cache["analysis_status"] == "completed":
                # Reuse cached analysis — show immediately.
                job_dict["analysis"] = cache["analysis"]
                job_dict["analysis_status"] = "completed"
                job_dict["salary"] = cache.get("salary")
                job_dict["visa"] = cache.get("visa")
                job_dict["min_exp"] = cache.get("min_exp")
                job_dict["visible"] = True
                inserted = await insert_job_if_new(supabase, ctx.user_id, job_dict, ttl_seconds=GREENHOUSE_TTL_SECONDS)
                _mark_seen(ctx.user_id, job.external_id)
                if inserted is None:
                    continue
                total_finds += 1
                await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
                job_dict["is_notified"] = True
                await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=GREENHOUSE_TTL_SECONDS)
                logger.info(f"New Target (Greenhouse, cached): {job.title} @ {job.company}")
            else:
                # Ensure enqueued (idempotent), insert hidden; worker flips + broadcasts.
                await create_cache_entry(supabase, job_dict["external_id"], job_dict["url"])
                await enqueue_job(supabase, job_dict["external_id"], job_dict["url"])
                job_dict["visible"] = False
                inserted = await insert_job_if_new(supabase, ctx.user_id, job_dict, ttl_seconds=GREENHOUSE_TTL_SECONDS)
                _mark_seen(ctx.user_id, job.external_id)
                if inserted is None:
                    continue
                total_finds += 1
                logger.info(f"Queued Greenhouse job {job_dict['external_id']} for analysis")
        else:
            # No analysis key — show immediately.
            job_dict["visible"] = True
            inserted = await insert_job_if_new(supabase, ctx.user_id, job_dict, ttl_seconds=GREENHOUSE_TTL_SECONDS)
            _mark_seen(ctx.user_id, job.external_id)
            if inserted is None:
                continue
            total_finds += 1
            await manager.broadcast(ctx.user_id, {"type": "NEW_JOB", "data": job_dict})
            job_dict["is_notified"] = True
            await upsert_job(supabase, ctx.user_id, job_dict, ttl_seconds=GREENHOUSE_TTL_SECONDS)
            logger.info(f"New Target (Greenhouse): {job.title} @ {job.company}")

    return total_finds


async def run_high_frequency_loop(ctx: UserContext):
    supabase = get_supabase_client()
    logger.info(f"[HF] Scraper started for {ctx.user_id}")
    while True:
        token = current_user_id.set(ctx.user_id)
        try:
            target_keywords = await get_target_keywords(supabase, ctx.user_id)

            # Fetch LinkedIn keywords sequentially with delay to avoid proxy/rate-limit issues
            linkedin_results = []
            for kw in target_keywords:
                try:
                    result = await fetch_linkedin_jobs(supabase, ctx.user_id, keywords=kw, location="United States")
                    linkedin_results.append(result)
                except Exception as e:
                    logger.error(f"[HF] LinkedIn fetch failed for '{kw}': {e}")
                await asyncio.sleep(random.uniform(1.5, 3.0))

            # Fetch Jobright — only if user has configured credentials
            try:
                supabase = get_supabase_client()
                jobright_creds = await get_jobright_credentials(supabase, ctx.user_id)
                if jobright_creds:
                    jobright_result = await fetch_jobright_jobs(
                        user_id=ctx.user_id,
                        creds=jobright_creds,
                        limit=15,
                        max_age_hours=2.0,
                    )
                    linkedin_results.append(jobright_result)
                else:
                    logger.debug(f"[HF] No Jobright credentials for {ctx.user_id}, skipping.")
            except Exception as e:
                logger.error(f"[HF] Jobright fetch failed: {e}")

            valid_results = [r for r in linkedin_results if isinstance(r, dict)]
            total = len(valid_results)
            failed = sum(1 for r in valid_results if r.get("failed", True))
            logger.info(
                f"[HF] {ctx.user_id} | {total} calls | "
                f"{total - failed} passed | {failed} failed"
            )
            new_finds = await process_and_alert_jobs(valid_results, ctx)
            if new_finds == 0:
                logger.debug(f"[HF] {ctx.user_id} No new targets.")
        except asyncio.CancelledError:
            current_user_id.reset(token)
            logger.info(f"[HF] Scraper stopped for {ctx.user_id}")
            break
        except Exception as e:
            logger.error(f"[HF] {ctx.user_id} Error: {e}")
        finally:
            current_user_id.reset(token)
        sleep_secs = 90 + random.uniform(-10, 10)
        next_at = datetime.now(timezone.utc) + timedelta(seconds=sleep_secs)
        await manager.broadcast(ctx.user_id, {
            "type": "SCRAPE_CYCLE",
            "data": {"scraper": "linkedin", "next_scrape_at": next_at.isoformat()}
        })
        await asyncio.sleep(sleep_secs)


async def run_low_frequency_loop(ctx: UserContext):
    supabase = get_supabase_client()
    logger.info(f"[LF] Scraper started for {ctx.user_id}")
    while True:
        try:
            results = await asyncio.gather(
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


async def run_indeed_loop(ctx: UserContext):
    """Dedicated Indeed scraper loop — polls every 3 minutes with connection pooling."""
    supabase = get_supabase_client()
    proxy = settings.PROXY_URL if settings.PROXY_URL else None
    logger.info(f"[Indeed] Scraper started for {ctx.user_id} (3-min interval, proxy={'yes' if proxy else 'no'})")

    # Reuse a single httpx client across cycles (connection pooling)
    client = httpx.AsyncClient(proxy=proxy)
    try:
        while True:
            try:
                result = await fetch_indeed_jobs(supabase, ctx.user_id, client=client)
                if not result.get("failed"):
                    new_finds = await process_and_alert_jobs([result], ctx)
                    if new_finds:
                        logger.info(f"[Indeed] {ctx.user_id} found {new_finds} new jobs")
                    else:
                        logger.debug(f"[Indeed] {ctx.user_id} No new targets.")
                else:
                    logger.warning(f"[Indeed] {ctx.user_id} fetch failed")
            except asyncio.CancelledError:
                logger.info(f"[Indeed] Scraper stopped for {ctx.user_id}")
                break
            except httpx.HTTPError as e:
                # Connection-level error — recreate the client
                logger.warning(f"[Indeed] {ctx.user_id} connection error, recreating client: {e}")
                await client.aclose()
                client = httpx.AsyncClient(proxy=proxy)
            except Exception as e:
                logger.error(f"[Indeed] {ctx.user_id} Error: {e}")
            sleep_secs = 180 + random.uniform(-20, 20)
            next_at = datetime.now(timezone.utc) + timedelta(seconds=sleep_secs)
            await manager.broadcast(ctx.user_id, {
                "type": "SCRAPE_CYCLE",
                "data": {"scraper": "indeed", "next_scrape_at": next_at.isoformat()}
            })
            await asyncio.sleep(sleep_secs)
    finally:
        await client.aclose()


async def run_greenhouse_match_loop(ctx: UserContext):
    """Per-user Greenhouse matcher — DB-only, no external requests.

    The global crawler fills the shared greenhouse_jobs pool. This loop reads
    jobs discovered since its last run, applies the user's keyword / title-block
    / blocked-company / location filters, and hands matches to
    process_and_alert_jobs (which reuses the shared analysis + broadcast path).
    """
    supabase = get_supabase_client()
    # In-memory cursor: only surface jobs discovered after the user came online,
    # matching LinkedIn's "new going forward" semantics. insert_job_if_new makes
    # a re-scan after restart harmless anyway.
    cursor = datetime.now(timezone.utc).isoformat()
    logger.info(f"[Greenhouse] Matcher started for {ctx.user_id}")

    while True:
        token = current_user_id.set(ctx.user_id)
        try:
            rows = await get_jobs_since(supabase, cursor, limit=500)
            if rows:
                target_keywords = await get_target_keywords(supabase, ctx.user_id)
                target_keywords_lower = [kw.lower() for kw in target_keywords]
                target_locations = await get_target_locations(supabase, ctx.user_id)
                title_filter_kws = await get_title_filter_keywords(supabase, ctx.user_id)
                blocked_companies = [c.lower() for c in await get_blocked_companies(supabase, ctx.user_id)]

                matched: List[JobCreate] = []
                for row in rows:
                    title = row.get("title") or ""
                    title_lower = title.lower()
                    company = row.get("company_name") or "Unknown Company"
                    location_raw = row.get("location_raw") or ""

                    if not any(kw in title_lower for kw in target_keywords_lower):
                        continue
                    if is_title_blocked(title, title_filter_kws):
                        continue
                    if any(b in company.lower() for b in blocked_companies):
                        continue
                    if not location_matches(location_raw, target_locations):
                        continue

                    posted_at = None
                    if row.get("first_published"):
                        try:
                            posted_at = datetime.fromisoformat(
                                row["first_published"].replace("Z", "+00:00")
                            )
                        except (ValueError, AttributeError):
                            posted_at = None

                    matched.append(JobCreate(
                        external_id=str(row["external_id"]),
                        title=title,
                        company=company,
                        location=location_raw or "Unknown Location",
                        url=row["url"],
                        source="Greenhouse",
                        posted_at=posted_at,
                    ))

                # Advance cursor to the newest row we just read (rows are asc by crawled_at).
                cursor = rows[-1]["crawled_at"]

                if matched:
                    new_finds = await process_and_alert_jobs([{"jobs": matched}], ctx)
                    if new_finds:
                        logger.info(f"[Greenhouse] {ctx.user_id} matched {new_finds} new job(s)")
        except asyncio.CancelledError:
            current_user_id.reset(token)
            logger.info(f"[Greenhouse] Matcher stopped for {ctx.user_id}")
            break
        except Exception as e:
            logger.error(f"[Greenhouse] {ctx.user_id} matcher error: {e}")
        finally:
            current_user_id.reset(token)
        await asyncio.sleep(settings.GREENHOUSE_MATCH_INTERVAL + random.uniform(-10, 10))


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


async def run_location_scrape_loop(ctx: UserContext, location: str):
    """LinkedIn scrape loop for a specific location. Mirrors run_high_frequency_loop."""
    supabase = get_supabase_client()
    logger.info(f"[LOC] Location scraper started for {ctx.user_id} → {location}")
    while True:
        token = current_user_id.set(ctx.user_id)
        try:
            target_keywords = await get_target_keywords(supabase, ctx.user_id)

            linkedin_results = []
            for kw in target_keywords:
                try:
                    result = await fetch_linkedin_jobs(supabase, ctx.user_id, keywords=kw, location=location)
                    linkedin_results.append(result)
                except Exception as e:
                    logger.error(f"[LOC] LinkedIn fetch failed for '{kw}' in {location}: {e}")
                await asyncio.sleep(random.uniform(1.5, 3.0))

            valid_results = [r for r in linkedin_results if isinstance(r, dict)]
            total = len(valid_results)
            failed = sum(1 for r in valid_results if r.get("failed", True))
            logger.info(
                f"[LOC] {ctx.user_id} ({location}) | {total} calls | "
                f"{total - failed} passed | {failed} failed"
            )
            new_finds = await process_and_alert_jobs(valid_results, ctx)
            if new_finds == 0:
                logger.debug(f"[LOC] {ctx.user_id} ({location}) No new targets.")
        except asyncio.CancelledError:
            current_user_id.reset(token)
            logger.info(f"[LOC] Location scraper stopped for {ctx.user_id}")
            break
        except Exception as e:
            logger.error(f"[LOC] {ctx.user_id} ({location}) Error: {e}")
        finally:
            current_user_id.reset(token)
        sleep_secs = 90 + random.uniform(-10, 10)
        next_at = datetime.now(timezone.utc) + timedelta(seconds=sleep_secs)
        await manager.broadcast(ctx.user_id, {
            "type": "SCRAPE_CYCLE",
            "data": {"scraper": "location", "next_scrape_at": next_at.isoformat()}
        })
        await asyncio.sleep(sleep_secs)


def _start_location_scraper(ctx: UserContext, linkedin_location: str):
    """Start or restart the location-specific LinkedIn scraper."""
    _stop_location_scraper(ctx)
    ctx.location_task = asyncio.create_task(run_location_scrape_loop(ctx, linkedin_location))
    logger.info(f"[LOC] Started location scraper for {ctx.user_id} → {linkedin_location}")


def _stop_location_scraper(ctx: UserContext):
    """Stop the location-specific LinkedIn scraper if running."""
    if ctx.location_task and not ctx.location_task.done():
        ctx.location_task.cancel()
        logger.info(f"[LOC] Stopped location scraper for {ctx.user_id}")
    ctx.location_task = None


def start_user_scrapers(ctx: UserContext) -> None:
    """Start HF and LF scraper tasks for a user if they aren't already running."""
    # Ensure we don't start them multiple times due to race conditions
    if getattr(ctx, "_scrapers_started", False):
        return

    if ctx.hf_task is None or ctx.hf_task.done():
        ctx.hf_task = asyncio.create_task(run_high_frequency_loop(ctx))
    if ctx.lf_task is None or ctx.lf_task.done():
        ctx.lf_task = asyncio.create_task(run_low_frequency_loop(ctx))
    if getattr(ctx, "custom_sources_task", None) is None or ctx.custom_sources_task.done():
        ctx.custom_sources_task = asyncio.create_task(run_custom_sources_loop(ctx))
    if ctx.indeed_task is None or ctx.indeed_task.done():
        ctx.indeed_task = asyncio.create_task(run_indeed_loop(ctx))
    if settings.GREENHOUSE_ENABLED and (
        getattr(ctx, "greenhouse_task", None) is None or ctx.greenhouse_task.done()
    ):
        ctx.greenhouse_task = asyncio.create_task(run_greenhouse_match_loop(ctx))

    # Start location scraper if user has a location filter set
    if ctx.location_task is None or ctx.location_task.done():
        asyncio.create_task(_maybe_start_location_scraper(ctx))

    ctx._scrapers_started = True


async def _maybe_start_location_scraper(ctx: UserContext):
    """Check if user has a location filter and start the scraper if so."""
    try:
        supabase = get_supabase_client()
        raw = await get_location_filter(supabase, ctx.user_id)
        if raw:
            normalized = normalize_location(raw)
            if normalized:
                _start_location_scraper(ctx, normalized["full_name"])
    except Exception as e:
        logger.warning(f"[LOC] Failed to check location filter for {ctx.user_id}: {e}")


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
    # Second filtering layer: scrapers filter at ingestion, but rows already in
    # the table predate any keyword the user adds later. Re-check on every read
    # so a new blacklist entry takes effect immediately.
    title_filter_keywords = await get_title_filter_keywords(supabase, ctx.user_id)
    try:
        # Fetch all visible scraped jobs from Supabase
        all_scraped = await get_all_jobs(supabase, ctx.user_id)
        jobs = []
        for job_data in all_scraped:
            company = (job_data.get("company") or "").lower()
            if any(b in company for b in blocked_lower):
                continue
            if is_title_blocked(job_data.get("title") or "", title_filter_keywords):
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
            if is_title_blocked(cj.get("title") or "", title_filter_keywords):
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
                "is_custom": True,
            })
    except Exception as e:
        logger.warning(f"Failed to fetch custom jobs from Supabase: {e}")

    jobs.sort(key=lambda x: x.get("posted_at") or "", reverse=True)
    return {"jobs": jobs, "count": len(jobs)}


class AnalyzeJobRequest(BaseModel):
    """Request to analyze a job and enqueue it for AI analysis."""
    external_id: str
    title: str
    company: str
    location: Optional[str] = None
    url: str
    source: str = "LinkedIn"
    posted_at: Optional[str] = None
    salary: Optional[str] = None
    visa: Optional[str] = None


@app.post("/jobs/analyze")
async def analyze_job(request: AnalyzeJobRequest, ctx: UserContext = Depends(_get_ctx)):
    """
    Submit a job for analysis. Enqueues it for background processing with DeepSeek.
    Returns the created job entry.

    The job will be analyzed asynchronously by the job queue worker.
    You can check the analysis status by polling /jobs/{external_id}/analysis.
    """
    supabase = get_supabase_client()

    try:
        # Create job entry with pending analysis status
        job_data = {
            "user_id": ctx.user_id,
            "source": request.source,
            "external_id": request.external_id,
            "title": request.title,
            "company": request.company,
            "location": request.location,
            "url": request.url,
            "posted_at": request.posted_at or datetime.now(timezone.utc).isoformat(),
            "visible": True,
            "is_notified": False,
            "salary": request.salary,
            "visa": request.visa,
            "analysis": None,
            "analysis_status": "pending",
        }

        # Insert/update the job in scraped_jobs table
        inserted_job = await upsert_job(supabase, ctx.user_id, job_data)

        # Enqueue the job for analysis
        from app.services.job_queue import enqueue_job
        await enqueue_job(supabase, request.external_id, request.url)

        logger.info(f"Job {request.external_id} enqueued for analysis")

        return {
            "message": "Job submitted for analysis",
            "job": inserted_job,
            "status": "queued"
        }

    except Exception as e:
        logger.error(f"Error submitting job for analysis: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to submit job for analysis: {str(e)}")


class ConfigUpdateRequest(BaseModel):
    values: list[str]


@app.get("/config")
async def get_config(ctx: UserContext = Depends(_get_ctx)):
    supabase = get_supabase_client()
    return await get_all_config(supabase, ctx.user_id)


# ── Public: read-only view of active global keywords ────────────────────────

@app.get("/keywords")
async def list_active_keywords(ctx: UserContext = Depends(_get_ctx)):
    """Return all active platform-wide job-title keywords."""
    supabase = get_supabase_client()
    keywords = await get_target_keywords(supabase)
    return {"keywords": keywords, "count": len(keywords)}


# ── Admin: full CRUD on global_keywords (service-role auth required) ─────────

class AdminKeywordRequest(BaseModel):
    keyword: str


class AdminKeywordToggleRequest(BaseModel):
    active: bool


def _require_service_key(authorization: str = None):
    """Dependency: accepts only requests bearing the service-role key."""
    from fastapi import Header
    return authorization


@app.get("/admin/keywords")
async def admin_list_keywords(authorization: Optional[str] = None):
    """List all global keywords (admin only)."""
    if authorization != f"Bearer {settings.SUPABASE_SERVICE_KEY}":
        raise HTTPException(status_code=403, detail="Admin access required")
    from app.core.global_keywords import list_global_keywords
    supabase = get_supabase_client()
    rows = await list_global_keywords(supabase)
    return {"keywords": rows}


@app.post("/admin/keywords", status_code=201)
async def admin_add_keyword(
    request: AdminKeywordRequest, authorization: Optional[str] = None
):
    """Add a new keyword to the global list (admin only)."""
    if authorization != f"Bearer {settings.SUPABASE_SERVICE_KEY}":
        raise HTTPException(status_code=403, detail="Admin access required")
    if not request.keyword.strip():
        raise HTTPException(status_code=422, detail="keyword must not be empty")
    from app.core.global_keywords import add_keyword
    supabase = get_supabase_client()
    row = await add_keyword(supabase, request.keyword.strip())
    return {"message": "Created", "keyword": row}


@app.put("/admin/keywords/{keyword_id}")
async def admin_toggle_keyword(
    keyword_id: str,
    request: AdminKeywordToggleRequest,
    authorization: Optional[str] = None,
):
    """Toggle a keyword active/inactive (admin only)."""
    if authorization != f"Bearer {settings.SUPABASE_SERVICE_KEY}":
        raise HTTPException(status_code=403, detail="Admin access required")
    from app.core.global_keywords import toggle_keyword
    supabase = get_supabase_client()
    row = await toggle_keyword(supabase, keyword_id, request.active)
    return {"message": "Updated", "keyword": row}


@app.delete("/admin/keywords/{keyword_id}", status_code=204)
async def admin_delete_keyword(keyword_id: str, authorization: Optional[str] = None):
    """Hard-delete a keyword (admin only)."""
    if authorization != f"Bearer {settings.SUPABASE_SERVICE_KEY}":
        raise HTTPException(status_code=403, detail="Admin access required")
    from app.core.global_keywords import delete_keyword
    supabase = get_supabase_client()
    await delete_keyword(supabase, keyword_id)


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
    _seen_linkedin.pop(ctx.user_id, None)
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
    _seen_linkedin.pop(ctx.user_id, None)

    # Apply the new blacklist retroactively to jobs already on the dashboard.
    hidden_ids = await hide_jobs_by_title_keywords(supabase, ctx.user_id, request.values)
    if hidden_ids:
        await manager.broadcast(
            ctx.user_id,
            {"type": "JOBS_FILTERED", "data": {"external_ids": hidden_ids}},
        )

    return {
        "message": "Updated",
        "title_filter_keywords": request.values,
        "removed_jobs_count": len(hidden_ids),
    }


class LocationFilterRequest(BaseModel):
    location: Optional[str] = None


@app.get("/config/location-filter")
async def get_location_filter_endpoint(ctx: UserContext = Depends(_get_ctx)):
    supabase = get_supabase_client()
    raw = await get_location_filter(supabase, ctx.user_id)
    normalized = normalize_location(raw) if raw else None
    return {"location": raw, "normalized": normalized}


@app.put("/config/location-filter")
async def update_location_filter(
    request: LocationFilterRequest, ctx: UserContext = Depends(_get_ctx)
):
    supabase = get_supabase_client()

    if request.location:
        normalized = normalize_location(request.location)
        if not normalized:
            raise HTTPException(status_code=400, detail=f"Unrecognized location: '{request.location}'. Try a US state name, abbreviation, or major city.")
        await set_location_filter(supabase, ctx.user_id, request.location)
        _start_location_scraper(ctx, normalized["full_name"])
        return {"location": request.location, "normalized": normalized}
    else:
        await set_location_filter(supabase, ctx.user_id, None)
        _stop_location_scraper(ctx)
        return {"location": None, "normalized": None}


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
async def get_logs(limit: int = 500, ctx: UserContext = Depends(_get_ctx)):
    logs = get_historical_logs(limit=limit, user_id=ctx.user_id)
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

        _seen_linkedin.pop(ctx.user_id, None)
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
    is_custom: bool = False


@app.post("/jobs/dismiss")
async def dismiss_job_endpoint(request: DismissJobRequest, ctx: UserContext = Depends(_get_ctx)):
    supabase = get_supabase_client()
    try:
        if request.is_custom:
            await dismiss_custom_job(supabase, ctx.user_id, request.external_id)
        else:
            ok = await dismiss_job_sb(supabase, ctx.user_id, request.source, request.external_id)
            if not ok:
                raise HTTPException(status_code=500, detail="Failed to dismiss job in database")

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
            return {
                "status": "completed",
                "analysis": job_data["analysis"],
            }

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
                .order("created_at", desc=True) \
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

        # Clean up dependent analysis data first
        def _delete_queue_items(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.table("resume_analysis_queue") \
                .delete() \
                .eq("resume_id", resume_id) \
                .eq("user_id", user["user_id"]) \
                .execute()

        await asyncio.to_thread(_delete_queue_items)

        def _delete_analysis(*args: Any, **kwargs: Any) -> Any:
            return _supabase_client.table("resume_analysis") \
                .delete() \
                .eq("resume_id", resume_id) \
                .eq("user_id", user["user_id"]) \
                .execute()

        await asyncio.to_thread(_delete_analysis)

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

        return {"status": "completed", "analysis": analysis}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching resume analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analysis")


class KeywordExtractRequest(BaseModel):
    job_description: str


@app.post("/keywords/extract")
async def extract_keywords(
    request: KeywordExtractRequest,
    ctx: UserContext = Depends(_get_ctx),
):
    """Extract ATS keywords from a job description using DeepSeek."""
    import json
    from openai import OpenAI

    settings = get_settings()
    api_key = settings.DEEPSEEK_API_KEY
    if not api_key:
        raise HTTPException(status_code=400, detail="DeepSeek API key not configured")

    KEYWORD_PROMPT = """You are an ATS (Applicant Tracking System) expert.
Given a job description, extract ALL keywords and phrases that an ATS system
would scan for in a resume and classify them into two categories:

HARD SKILLS — Technical requirements and specific tools a candidate should list in their
"Skills" section or weave into "Professional Experience" bullets. This includes:
programming languages, frameworks, platforms, tools, methodologies, certifications,
domain-specific technical terms, core technical competencies, documentation standards,
security & ops practices, data & analytics, industry platforms.

SOFT SKILLS — Transferable behavioural competencies that are best demonstrated through
bullet-point achievements rather than just being listed as single words. Examples:
Analytical Problem-Solving, Technical Translation, Cross-functional Collaboration,
Stakeholder Management, Strategic Communication, Leadership, Adaptability, etc.

Rules:
- No duplicates within each list (case-insensitive).
- A keyword must appear in only one category.
- Return ONLY a JSON object with exactly two keys: "hard_skills" and "soft_skills",
  each containing a flat list of strings. No explanations, no extra keys.

Example:
{
  "hard_skills": ["Python", "AWS", "REST APIs", "SQL", "CI/CD", "Agile"],
  "soft_skills": ["Cross-functional Collaboration", "Analytical Problem-Solving", "Technical Communication"]
}"""

    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
    response = await asyncio.to_thread(
        lambda: client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": KEYWORD_PROMPT},
                {"role": "user", "content": request.job_description},
            ],
            response_format={"type": "json_object"},
            max_tokens=2048,
        )
    )
    raw = response.choices[0].message.content
    data = json.loads(raw)
    return {
        "hard_skills": data.get("hard_skills", []),
        "soft_skills": data.get("soft_skills", []),
    }
