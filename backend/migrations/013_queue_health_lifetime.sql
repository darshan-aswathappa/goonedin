-- 013_queue_health_lifetime.sql
--
-- Fixes a regression introduced by 011_storage_reclaim.sql.
--
-- 011 pruned 2,828 terminal rows from job_analysis_queue but left
-- analytics_queue_health() counting only live rows, so the dashboard's "completed"
-- figure dropped from 23,281 to 20,511 -- a reporting discontinuity, not real data.
--
-- 011's job_queue_lifetime schema was also wrong for ongoing use: completed_total /
-- failed_total were seeded as snapshots of the then-live counts, which cannot be
-- maintained without also tracking every insert. The only quantity that actually
-- needs durable tracking is what we DELETE, because live rows are still countable.
--
-- Correct invariant:
--     lifetime_completed = live_completed + pruned_completed
--     lifetime_failed    = live_failed    + pruned_failed
--
-- Backfill note: 011 recorded pruned_total = 2828 without splitting by status. The
-- 'failed' count was 40 immediately before and immediately after that prune, so no
-- failed rows were eligible; all 2,828 were 'completed'.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Reshape the counter to track only what gets deleted, split by status
-- ---------------------------------------------------------------------------
ALTER TABLE job_queue_lifetime
    ADD COLUMN IF NOT EXISTS pruned_completed bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pruned_failed    bigint NOT NULL DEFAULT 0;

-- Attribute 011's undifferentiated pruned_total to 'completed' (see note above).
UPDATE job_queue_lifetime
SET pruned_completed = 2828,
    pruned_failed    = 0,
    updated_at       = now()
WHERE id = true
  AND pruned_completed = 0
  AND pruned_total     = 2828;

-- These two were snapshots that cannot be kept correct; drop them so nothing
-- downstream is tempted to read them.
ALTER TABLE job_queue_lifetime
    DROP COLUMN IF EXISTS completed_total,
    DROP COLUMN IF EXISTS failed_total;

COMMENT ON TABLE job_queue_lifetime IS
  'Durable tally of job_analysis_queue rows deleted by retention pruning. '
  'analytics_queue_health() adds these to live counts so dashboard totals stay '
  'continuous across prunes. Only deletions are tracked; live rows are counted directly.';

-- ---------------------------------------------------------------------------
-- 2. Single pruning entry point, so the counter can never drift from reality
-- ---------------------------------------------------------------------------
-- Deleting and crediting the counter in one statement makes them atomic. Any future
-- prune MUST go through this function rather than issuing a bare DELETE.
CREATE OR REPLACE FUNCTION prune_job_analysis_queue(retain_days integer DEFAULT 7)
RETURNS TABLE(pruned_completed bigint, pruned_failed bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    c bigint;
    f bigint;
BEGIN
    WITH doomed AS (
        DELETE FROM job_analysis_queue
        WHERE status IN ('completed', 'failed')
          AND coalesce(updated_at, created_at) < now() - make_interval(days => retain_days)
        RETURNING status
    )
    SELECT count(*) FILTER (WHERE status = 'completed'),
           count(*) FILTER (WHERE status = 'failed')
    INTO c, f
    FROM doomed;

    UPDATE job_queue_lifetime q
    SET pruned_completed = q.pruned_completed + c,
        pruned_failed    = q.pruned_failed    + f,
        pruned_total     = q.pruned_total     + c + f,
        updated_at       = now()
    WHERE q.id = true;

    RETURN QUERY SELECT c, f;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Make analytics_queue_health() lifetime-aware
-- ---------------------------------------------------------------------------
-- Restores continuity: completed/failed/total now equal live + pruned, so the
-- numbers match what the dashboard showed before 011 and keep rising monotonically.
-- 'pending' stays live-only (a pruned row is by definition not pending).
-- withVisa / withSalary / analyzedCount are unchanged -- they read
-- job_analysis_cache, which this migration does not touch.
CREATE OR REPLACE FUNCTION public.analytics_queue_health()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH live AS (
    SELECT count(*) FILTER (WHERE status = 'completed')                  AS completed,
           count(*) FILTER (WHERE status = 'failed')                     AS failed,
           count(*) FILTER (WHERE status NOT IN ('completed','failed'))  AS pending,
           count(*)                                                      AS total
    FROM job_analysis_queue
  ), pruned AS (
    SELECT coalesce(max(pruned_completed), 0) AS completed,
           coalesce(max(pruned_failed), 0)    AS failed
    FROM job_queue_lifetime
  )
  SELECT json_build_object(
    'completed',  live.completed + pruned.completed,
    'failed',     live.failed    + pruned.failed,
    'pending',    live.pending,
    'total',      live.total     + pruned.completed + pruned.failed,
    'withVisa',   (SELECT count(*) FROM job_analysis_cache
                   WHERE visa IS NOT NULL AND btrim(visa) <> ''),
    'withSalary', (SELECT count(*) FROM job_analysis_cache
                   WHERE salary IS NOT NULL AND btrim(salary) <> ''),
    'analyzedCount', (SELECT count(*) FROM job_analysis_cache
                      WHERE analysis_status = 'completed')
  )
  FROM live, pruned;
$function$;

COMMIT;
