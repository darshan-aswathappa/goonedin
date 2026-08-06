-- 011_storage_reclaim.sql
--
-- Reclaims ~210 MB of a 518 MB database that is over the 500 MB Supabase limit.
-- Every change here is analytically lossless: measurements on 2026-08-06 confirmed
-- that no analytics RPC or route reads greenhouse_jobs, job_embeddings, or the
-- indexes dropped below, and that all four dropped indexes had idx_scan = 0 over a
-- 22-day stats window covering the entire 9-day lifetime of the data.
--
-- Measured sizes before this migration:
--   database total ................ 518 MB
--   job_analysis_cache ............ 390 MB  (30 MB heap / 184 MB idx / 177 MB toast)
--   idx_jac_embedding_hnsw ........ 166 MB  idx_scan = 0
--   idx_jac_analysis_gin .......... 13 MB   idx_scan = 0
--   idx_sj_title_trgm ............. 9.4 MB  idx_scan = 0
--   idx_sj_company_trgm ........... 6.3 MB  idx_scan = 0
--   job_embeddings ................ 1.6 MB  0 rows, indexes only
--   job_analysis_queue ............ 7.8 MB  23,281 completed + 40 failed
--   greenhouse_jobs (toast) ....... 7.1 MB  content column
--
-- NOTE: dropping an index frees its space immediately. Steps 3 and 4 only mark
-- tuples dead -- run VACUUM (and VACUUM FULL for heap/toast shrink) afterwards.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop never-used indexes (~195 MB, immediate)
-- ---------------------------------------------------------------------------
-- Rollback definitions, verbatim from pg_get_indexdef before the drop:
--
--   CREATE INDEX idx_jac_embedding_hnsw ON public.job_analysis_cache
--     USING hnsw (embedding vector_cosine_ops) WITH (m='16', ef_construction='64');
--   CREATE INDEX idx_jac_analysis_gin ON public.job_analysis_cache
--     USING gin (to_tsvector('simple'::regconfig, COALESCE(analysis, ''::text)));
--   CREATE INDEX idx_sj_title_trgm ON public.scraped_jobs
--     USING gin (title gin_trgm_ops) WHERE (title IS NOT NULL);
--   CREATE INDEX idx_sj_company_trgm ON public.scraped_jobs
--     USING gin (company gin_trgm_ops) WHERE ((company IS NOT NULL) AND (company <> ''::text));
--
-- search_jobs_by_embedding (backend/app/services/knowledge_base/embeddings.py:275)
-- stays functional without idx_jac_embedding_hnsw -- it falls back to a sequential
-- scan. That is acceptable because the index served zero queries in 22 days. If
-- semantic search ever sees real traffic, rebuild it against halfvec (migration 012),
-- which costs ~83 MB instead of 166 MB.
DROP INDEX IF EXISTS idx_jac_embedding_hnsw;
DROP INDEX IF EXISTS idx_jac_analysis_gin;
DROP INDEX IF EXISTS idx_sj_title_trgm;
DROP INDEX IF EXISTS idx_sj_company_trgm;

-- ---------------------------------------------------------------------------
-- 2. Drop the legacy job_embeddings table (~1.6 MB)
-- ---------------------------------------------------------------------------
-- Superseded by job_analysis_cache.embedding (migration 001). 0 rows, but still
-- carries a pkey + FK index. match_job_embeddings() is the legacy IVFFlat RPC that
-- reads it; it appears only in a docstring comment
-- (backend/app/services/knowledge_base/embeddings.py:255), never in a call site.
DROP FUNCTION IF EXISTS match_job_embeddings(vector, double precision, integer);
DROP TABLE IF EXISTS job_embeddings;

-- ---------------------------------------------------------------------------
-- 3. Bound job_analysis_queue growth (~7 MB)
-- ---------------------------------------------------------------------------
-- analytics_queue_health() counts rows in this table, so pruning it would silently
-- reset the completed/failed/total figures on the dashboard. Seed a lifetime counter
-- first and have the RPC read counter + live rows so the numbers stay continuous.
CREATE TABLE IF NOT EXISTS job_queue_lifetime (
    id              boolean PRIMARY KEY DEFAULT true CHECK (id),
    completed_total  bigint NOT NULL DEFAULT 0,
    failed_total     bigint NOT NULL DEFAULT 0,
    pruned_total     bigint NOT NULL DEFAULT 0,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Seed once from current contents (idempotent: ON CONFLICT DO NOTHING).
INSERT INTO job_queue_lifetime (id, completed_total, failed_total, pruned_total)
SELECT true,
       count(*) FILTER (WHERE status = 'completed'),
       count(*) FILTER (WHERE status = 'failed'),
       0
FROM job_analysis_queue
ON CONFLICT (id) DO NOTHING;

-- Prune terminal rows older than 7 days, crediting the counter for exactly what we
-- remove so completed + failed totals remain exact across the prune boundary.
WITH doomed AS (
    DELETE FROM job_analysis_queue
    WHERE status IN ('completed', 'failed')
      AND coalesce(updated_at, created_at) < now() - interval '7 days'
    RETURNING status
), tally AS (
    SELECT count(*) FILTER (WHERE status = 'completed') AS c,
           count(*) FILTER (WHERE status = 'failed')    AS f,
           count(*)                                     AS n
    FROM doomed
)
UPDATE job_queue_lifetime q
SET pruned_total = q.pruned_total + tally.n,
    updated_at   = now()
FROM tally
WHERE q.id = true;

CREATE INDEX IF NOT EXISTS idx_jaq_status_updated_at
    ON job_analysis_queue (status, updated_at)
    WHERE status IN ('completed', 'failed');

-- ---------------------------------------------------------------------------
-- 4. Release greenhouse_jobs.content (~7 MB)
-- ---------------------------------------------------------------------------
-- content is fetched once by the crawler and read once during analysis
-- (backend/app/services/job_queue_worker.py:130 is only a recovery path for an
-- already-queued job). Null the column rather than deleting rows: the row must
-- survive so the crawler's upsert/ignore_duplicates keeps deduping boards.
-- No analytics RPC reads greenhouse_jobs at all (grep-verified).
UPDATE greenhouse_jobs
SET content = NULL
WHERE content IS NOT NULL
  AND crawled_at < now() - interval '3 days';

-- ---------------------------------------------------------------------------
-- 5. Wire up the session cleanup that migration 006 defined but never scheduled
-- ---------------------------------------------------------------------------
-- cleanup_expired_ai_kb_sessions() has existed since 006_kb_sessions.sql:30 and is
-- invoked by nothing. Small today (24 kB) but unbounded. Called from the backend
-- maintenance loop; see backend/app/main.py.

COMMIT;

-- ---------------------------------------------------------------------------
-- Post-migration: reclaim heap/toast space marked dead by steps 3 and 4.
-- VACUUM FULL takes ACCESS EXCLUSIVE -- run with the backend stopped.
-- Deliberately outside the transaction (VACUUM cannot run inside one).
-- ---------------------------------------------------------------------------
--   VACUUM (ANALYZE) job_analysis_queue;
--   VACUUM (ANALYZE) greenhouse_jobs;
--   VACUUM FULL job_analysis_queue;
--   VACUUM FULL greenhouse_jobs;
