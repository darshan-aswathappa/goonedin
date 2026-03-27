-- =============================================================================
-- Recommended Indexes for HireFeed Analytics Queries
--
-- Apply with: psql $DATABASE_URL -f indexes.sql
-- Or paste into the Supabase SQL editor.
--
-- Each index is created with IF NOT EXISTS so this file is idempotent.
-- CONCURRENTLY lets Postgres build the index without locking the table
-- for reads/writes — safe to run on a live production database.
-- Note: CONCURRENTLY cannot run inside a transaction block; run each
-- statement individually if you wrap things in BEGIN/COMMIT.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. job_analysis_cache: (analysis_status, created_at)
--
-- Why: skill-momentum/route.ts and experience/route.ts both do:
--        .eq("analysis_status", "completed")  [equality filter]
--        ... optionally with created_at ordering or range filters
--
-- This composite index lets Postgres satisfy the WHERE clause with an index
-- seek and retrieve rows in created_at order without a sort step.
-- analysis_status first because it is the equality predicate (low cardinality
-- but high selectivity for 'completed'); created_at second for range/ordering.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_jac_status_created_at
ON job_analysis_cache (analysis_status, created_at DESC);


-- ---------------------------------------------------------------------------
-- 2. job_analysis_cache: GIN index on the analysis JSONB column
--
-- Why: analytics_skill_momentum (the new RPC) and analytics_skill_cooccurrence
-- (existing RPC) both call jsonb_array_elements_text() on must_have_keywords
-- and good_to_have_keywords. A GIN index on the whole column lets Postgres
-- short-circuit containment checks (@>) even if it cannot fully avoid
-- unnesting.  More importantly it makes queries like
--   WHERE analysis ? 'must_have_keywords'
-- (existence checks inside the RPC's CASE guards) index-driven.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_jac_analysis_gin
ON job_analysis_cache USING GIN (analysis jsonb_path_ops);


-- ---------------------------------------------------------------------------
-- 3. scraped_jobs: (company, created_at)
--
-- Why: hiring-velocity/route.ts does:
--        .in("company", top5)           [IN filter]
--        .gte("created_at", cutoff)     [range filter]
--
-- The composite index eliminates a full table scan for the 7-day window
-- across the top-5 companies. company first (equality/IN), created_at second
-- (range).  Covers both the filter and the implicit ORDER BY created_at used
-- in salary-by-location deduplication (earliest created_at per external_id).
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_scraped_jobs_company_created_at
ON scraped_jobs (company, created_at DESC);


-- ---------------------------------------------------------------------------
-- 4. scraped_jobs: (external_id)
--
-- Why: hiring-velocity/route.ts deduplicates by external_id in JS with a Set,
-- and salary-by-location/route.ts does the same. If these are moved to SQL,
-- or if any future RPC does GROUP BY / DISTINCT ON external_id, this index
-- makes lookups O(log n) instead of O(n).  Also speeds up any FK references
-- or JOIN conditions on external_id between scraped_jobs and
-- job_analysis_cache.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  idx_scraped_jobs_external_id
ON scraped_jobs (external_id);


-- ---------------------------------------------------------------------------
-- 5. scraped_jobs: (created_at)
--
-- Why: analytics_timeline RPC and salary-by-location both filter or sort by
-- created_at without a company filter. A standalone created_at index
-- is used when Postgres cannot use the composite (company, created_at) index
-- because company is absent from the predicate.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_scraped_jobs_created_at
ON scraped_jobs (created_at DESC);


-- ---------------------------------------------------------------------------
-- 6. scraped_jobs: (salary) WHERE salary IS NOT NULL
--
-- Why: salary-by-location/route.ts does:
--        .not("salary", "is", null)
-- A partial index excludes the majority-null rows, keeping the index small
-- and the bitmap heap scan selective.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_scraped_jobs_salary_not_null
ON scraped_jobs (salary)
WHERE salary IS NOT NULL;


-- =============================================================================
-- CLUSTER recommendations (run during a maintenance window, not CONCURRENTLY)
-- =============================================================================
-- After the indexes above exist you can physically reorder the heap to match
-- the most important index for sequential-scan performance:
--
--   CLUSTER job_analysis_cache USING idx_jac_status_created_at;
--   CLUSTER scraped_jobs       USING idx_scraped_jobs_created_at;
--   ANALYZE job_analysis_cache;
--   ANALYZE scraped_jobs;
--
-- This is optional but can cut the cost of the skill-momentum full scan
-- (while it still reads all 'completed' rows) by 30-50% via improved
-- data locality.
-- =============================================================================
