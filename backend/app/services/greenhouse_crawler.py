"""
Global Greenhouse crawler.

One background task (not per-user). Each round it takes a shard of live boards
ordered oldest-crawled-first, fetches their job lists concurrently, keeps jobs
that are fresh + globally relevant, pulls the description for those survivors,
and upserts them into the shared `greenhouse_jobs` pool. Genuinely-new jobs are
enqueued for DeepSeek analysis with their description pre-stored, so the
existing analysis worker + broadcast path handles the rest (shared across all
users). The per-user matcher then fans matching jobs into scraped_jobs.

Boards fetched once per sweep regardless of how many users are online.
"""

import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.supabase_config import get_target_keywords, get_title_filter_keywords
from app.services.greenhouse_boards import get_shard, mark_crawled, mark_failed
from app.services.greenhouse_jobs import upsert_greenhouse_job
from app.services.job_queue import create_cache_entry, enqueue_job
from app.services.job_queue_worker import store_description
from app.services.scraper_greenhouse import (
    FETCH_DEAD,
    FETCH_OK,
    ParsedJob,
    fetch_board_jobs,
    fetch_job_content,
    is_fresh,
    is_globally_relevant,
    parse_job,
)

logger = logging.getLogger("GreenhouseCrawler")
settings = get_settings()


async def _crawl_board(
    client: httpx.AsyncClient,
    supabase: Any,
    board: dict,
    global_keywords: list[str],
    global_blocklist: list[str],
    sem: asyncio.Semaphore,
) -> int:
    """Crawl one board. Returns the number of newly-ingested jobs."""
    slug = board["slug"]
    failures = board.get("consecutive_failures", 0) or 0

    async with sem:
        status, raw_jobs = await fetch_board_jobs(client, slug)

    if status == FETCH_DEAD:
        await mark_failed(supabase, slug, failures, settings.GREENHOUSE_MAX_FAILURES)
        return 0
    if status != FETCH_OK:
        await mark_failed(supabase, slug, failures, settings.GREENHOUSE_MAX_FAILURES)
        return 0

    # Phase 1: parse + filter (cheap, no descriptions yet).
    survivors: list[ParsedJob] = []
    company_name = board.get("company_name")
    for raw in raw_jobs:
        job = parse_job(raw, slug)
        if job is None:
            continue
        company_name = company_name or job.company_name
        if not is_fresh(job, settings.GREENHOUSE_FRESHNESS_HOURS):
            continue
        if not is_globally_relevant(job.title, global_keywords, global_blocklist):
            continue
        survivors.append(job)

    # Board is healthy — stamp it even if nothing survived the filter.
    await mark_crawled(supabase, slug, company_name)

    if not survivors:
        return 0

    # Phase 2: fetch descriptions only for survivors, then persist + enqueue.
    new_count = 0
    for job in survivors:
        async with sem:
            content = await fetch_job_content(client, slug, job.external_id)

        inserted = await upsert_greenhouse_job(supabase, job, content)
        if not inserted:
            continue  # already in the shared pool — skip re-enqueue

        new_count += 1
        # Reuse the shared analysis pipeline: pre-store the description so the
        # worker doesn't refetch, then enqueue. Broadcast happens on completion.
        external_id = str(job.external_id)
        if content:
            store_description(external_id, content)
        await create_cache_entry(supabase, external_id, job.url)
        await enqueue_job(supabase, external_id, job.url)

    if new_count:
        logger.info(f"[Greenhouse] {slug}: {new_count} new job(s) ingested")
    return new_count


async def run_greenhouse_crawler(supabase: Any) -> None:
    """Main crawler loop. One instance, started at app startup."""
    if not settings.GREENHOUSE_ENABLED:
        logger.info("[Greenhouse] Crawler disabled (GREENHOUSE_ENABLED=false)")
        return

    sem = asyncio.Semaphore(settings.GREENHOUSE_CONCURRENCY)
    proxy = settings.PROXY_URL or None
    logger.info(
        f"[Greenhouse] Crawler started — shard={settings.GREENHOUSE_SHARD_SIZE}, "
        f"concurrency={settings.GREENHOUSE_CONCURRENCY}, "
        f"freshness={settings.GREENHOUSE_FRESHNESS_HOURS}h"
    )

    async with httpx.AsyncClient(follow_redirects=True, proxy=proxy) as client:
        while True:
            round_started = datetime.now(timezone.utc)
            try:
                # Global filter lists (empty user_id → global defaults). Reloaded
                # each round so admin keyword edits take effect within a sweep.
                global_keywords = await get_target_keywords(supabase, "")
                global_blocklist = await get_title_filter_keywords(supabase, "")

                boards = await get_shard(supabase, settings.GREENHOUSE_SHARD_SIZE)
                if not boards:
                    logger.debug("[Greenhouse] No live boards to crawl")
                else:
                    results = await asyncio.gather(
                        *[
                            _crawl_board(
                                client, supabase, b,
                                global_keywords, global_blocklist, sem,
                            )
                            for b in boards
                        ],
                        return_exceptions=True,
                    )
                    total_new = sum(r for r in results if isinstance(r, int))
                    errors = sum(1 for r in results if isinstance(r, Exception))
                    elapsed = (datetime.now(timezone.utc) - round_started).total_seconds()
                    logger.info(
                        f"[Greenhouse] Round: {len(boards)} boards, "
                        f"{total_new} new jobs, {errors} errors, {elapsed:.0f}s"
                    )
            except asyncio.CancelledError:
                logger.info("[Greenhouse] Crawler stopped")
                break
            except Exception as e:
                logger.error(f"[Greenhouse] Round error: {type(e).__name__}: {e}")

            await asyncio.sleep(
                settings.GREENHOUSE_ROUND_DELAY + random.uniform(0, 5)
            )
