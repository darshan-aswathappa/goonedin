-- ============================================================
-- GoOneIn — Greenhouse ingestion
-- Two tables: a board registry with crawl cursors, and a shared
-- global pool of fresh jobs. Analysis is NOT stored here; it reuses
-- the existing shared job_analysis_cache (keyed by external_id).
-- Run once against your Supabase PostgreSQL database.
-- ============================================================

-- 1. Board registry (seeded from data/greenhouse.json).
--    One row per Greenhouse board (company). Carries the crawl cursor
--    so the global crawler can shard by oldest-crawled-first.
CREATE TABLE IF NOT EXISTS greenhouse_boards (
    slug                  TEXT PRIMARY KEY,          -- e.g. "appflame"
    status                TEXT NOT NULL DEFAULT 'live',  -- 'live' | 'dead'
    company_name          TEXT,                      -- filled after first crawl
    last_crawled_at       TIMESTAMPTZ,               -- NULL = never crawled
    consecutive_failures  INT  NOT NULL DEFAULT 0,   -- mark dead after N 404s
    first_seen_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Shard-selection index: live boards ordered by oldest crawl (NULLs first).
CREATE INDEX IF NOT EXISTS idx_greenhouse_boards_shard
    ON greenhouse_boards (status, last_crawled_at NULLS FIRST);

-- 2. Shared global pool of fresh Greenhouse jobs.
--    One row per job (NOT per user). The per-user matcher reads from
--    here and fans matching jobs into scraped_jobs.
CREATE TABLE IF NOT EXISTS greenhouse_jobs (
    external_id     BIGINT PRIMARY KEY,              -- Greenhouse job id
    board_slug      TEXT NOT NULL REFERENCES greenhouse_boards(slug) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    company_name    TEXT NOT NULL,
    location_raw    TEXT,                            -- raw "location.name", e.g. "Europe; Poland; Ukraine"
    url             TEXT NOT NULL,
    first_published TIMESTAMPTZ,                     -- true post timestamp (freshness signal)
    updated_at      TIMESTAMPTZ,                     -- last edit / re-index
    content         TEXT,                            -- unescaped, plain-text description (for analysis)
    crawled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- when WE discovered it (matcher cursor)
);

-- Matcher scans "jobs discovered since my last run".
CREATE INDEX IF NOT EXISTS idx_greenhouse_jobs_crawled_at
    ON greenhouse_jobs (crawled_at DESC);

-- Freshness / housekeeping lookups.
CREATE INDEX IF NOT EXISTS idx_greenhouse_jobs_first_published
    ON greenhouse_jobs (first_published DESC);

CREATE INDEX IF NOT EXISTS idx_greenhouse_jobs_board
    ON greenhouse_jobs (board_slug);
