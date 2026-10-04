-- 015_free_tier_retention.sql
--
-- Keeps the database inside the Supabase Free plan's 500 MB quota.
--
-- Before this, only invisible scraped/custom jobs were ever deleted (60 days).
-- job_analysis_queue, greenhouse_jobs and job_analysis_cache grew forever.
-- run_retention() bounds them; the backend calls it hourly from its cleanup
-- loop. Each call deletes at most p_batch rows per table so no single run
-- holds locks for long on the shared Nano CPU — a backlog drains over
-- successive calls.
--
-- Also removes the resume-analysis feature's tables (feature removed; all
-- three tables were empty) and the analytics-only queue lifetime counter.

BEGIN;

CREATE OR REPLACE FUNCTION run_retention(
    p_queue_days      integer DEFAULT 7,
    p_greenhouse_days integer DEFAULT 14,
    p_cache_days      integer DEFAULT 30,
    p_batch           integer DEFAULT 10000
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    q  bigint;
    g  bigint;
    c  bigint;
BEGIN
    -- Finished analysis-queue rows: the result lives in job_analysis_cache.
    DELETE FROM job_analysis_queue
    WHERE ctid IN (
        SELECT ctid FROM job_analysis_queue
        WHERE status IN ('completed', 'failed')
          AND coalesce(updated_at, created_at) < now() - make_interval(days => p_queue_days)
        LIMIT p_batch
    );
    GET DIAGNOSTICS q = ROW_COUNT;

    -- Greenhouse pool: descriptions are only needed until analysis runs, and
    -- the crawler only ingests jobs published within the freshness window,
    -- so old rows are never re-read or re-inserted.
    DELETE FROM greenhouse_jobs
    WHERE ctid IN (
        SELECT ctid FROM greenhouse_jobs
        WHERE crawled_at < now() - make_interval(days => p_greenhouse_days)
        LIMIT p_batch
    );
    GET DIAGNOSTICS g = ROW_COUNT;

    -- Analysis cache entries no user can reach any more. Saved jobs read
    -- their analysis from here, so those are kept regardless of age.
    DELETE FROM job_analysis_cache
    WHERE ctid IN (
        SELECT jac.ctid FROM job_analysis_cache jac
        WHERE jac.created_at < now() - make_interval(days => p_cache_days)
          AND NOT EXISTS (SELECT 1 FROM scraped_jobs s       WHERE s.external_id = jac.external_id)
          AND NOT EXISTS (SELECT 1 FROM custom_source_jobs cs WHERE cs.external_id = jac.external_id)
          AND NOT EXISTS (SELECT 1 FROM saved_jobs sv         WHERE sv.external_id = jac.external_id)
          AND NOT EXISTS (SELECT 1 FROM job_analysis_queue jq WHERE jq.external_id = jac.external_id
                                                               AND jq.status IN ('pending', 'processing'))
        LIMIT p_batch
    );
    GET DIAGNOSTICS c = ROW_COUNT;

    RETURN json_build_object('queue', q, 'greenhouse', g, 'cache', c);
END;
$$;

REVOKE ALL ON FUNCTION run_retention(integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION run_retention(integer, integer, integer, integer) TO service_role;

-- Supports the orphan-cache age filter.
CREATE INDEX IF NOT EXISTS idx_jac_created_at ON job_analysis_cache (created_at);

-- Superseded by run_retention(); its lifetime counter only fed the removed
-- analytics_queue_health() RPC.
DROP FUNCTION IF EXISTS prune_job_analysis_queue(integer);
DROP TABLE IF EXISTS job_queue_lifetime;

-- Resume analysis feature removed.
DROP TABLE IF EXISTS resume_analysis_queue;
DROP TABLE IF EXISTS resume_analysis;
DROP TABLE IF EXISTS user_resumes;

COMMIT;
