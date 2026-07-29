-- =============================================================================
-- RPC: analytics_skill_gap
-- Computes per-skill must_have vs good_to_have split plus growth metrics.
--
-- What this does in Postgres:
--   1. Filters job_analysis_cache to analysis_status = 'completed'
--   2. Parses the TEXT analysis column via analytics_analysis_jsonb()
--   3. Unnests must_have_keywords and good_to_have_keywords separately,
--      preserving the source bucket per keyword
--   4. Lowercases, trims, applies length guard (2..50 chars)
--   5. Applies the same soft-skill blocklist used by analytics_skill_momentum
--   6. Deduplicates: a skill counted at most once per (job, bucket)
--   7. Counts must_have and good_to_have per skill (both using DISTINCT jobs)
--   8. Computes total = distinct job count across BOTH buckets (deduped per job)
--   9. Computes recent = distinct job count last 14 days (both buckets, deduped)
--  10. Computes prior  = distinct job count in 14-28 day window (both, deduped)
--  11. Computes growth = ROUND(((recent - prior)::float / GREATEST(prior,1))*100, 1)
--      Special case: prior=0 and recent>0 → 100.0; both zero → 0.0
--  12. Keeps only skills with total >= 10 across all time
--  13. Returns JSON ordered by total DESC
--
-- Declared STABLE so Postgres can cache within a transaction and PostgREST
-- can cache at the HTTP layer.
-- =============================================================================

CREATE OR REPLACE FUNCTION analytics_skill_gap()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_now     timestamptz := NOW();
BEGIN
  WITH

  -- -------------------------------------------------------------------------
  -- Step 1: Base rows — completed analyses only, parse the TEXT analysis column
  -- -------------------------------------------------------------------------
  -- The recent/prior windows key off the job's POSTING date, not
  -- job_analysis_cache.created_at. Cache created_at records when the analyzer wrote
  -- the row, so on a freshly populated database every posting collapses into the
  -- recent window, prior is 0 for every skill, and growth reads +100% across the
  -- board. analytics_resolved_at() also keeps this consistent with the other
  -- time-series RPCs.
  posted AS (
    SELECT DISTINCT ON (external_id)
      external_id, analytics_resolved_at(posted_at, created_at) AS resolved_at
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  ),
  base AS (
    SELECT
      c.external_id,
      analytics_analysis_jsonb(c.analysis) AS analysis,
      coalesce(p.resolved_at, c.created_at) AS posted_ts
    FROM job_analysis_cache c
    LEFT JOIN posted p ON p.external_id = c.external_id
    WHERE
      c.analysis_status = 'completed'
      AND c.analysis IS NOT NULL
      AND coalesce(p.resolved_at, c.created_at) IS NOT NULL
  ),

  -- -------------------------------------------------------------------------
  -- Step 2a: Unnest must_have_keywords — one row per (job, keyword, posted_ts)
  -- -------------------------------------------------------------------------
  raw_must_have AS (
    SELECT
      b.external_id,
      b.posted_ts,
      lower(trim(kw)) AS skill,
      'must_have' AS bucket
    FROM base b,
    LATERAL (
      SELECT jsonb_array_elements_text(analytics_jsonb_array(b.analysis->'must_have_keywords'))
    ) AS kw_unnest(kw)
    WHERE b.analysis IS NOT NULL
  ),

  -- -------------------------------------------------------------------------
  -- Step 2b: Unnest good_to_have_keywords
  -- -------------------------------------------------------------------------
  raw_good_to_have AS (
    SELECT
      b.external_id,
      b.posted_ts,
      lower(trim(kw)) AS skill,
      'good_to_have' AS bucket
    FROM base b,
    LATERAL (
      SELECT jsonb_array_elements_text(analytics_jsonb_array(b.analysis->'good_to_have_keywords'))
    ) AS kw_unnest(kw)
    WHERE b.analysis IS NOT NULL
  ),

  -- -------------------------------------------------------------------------
  -- Step 2c: Union both buckets together (preserving bucket label)
  -- -------------------------------------------------------------------------
  raw_all AS (
    SELECT external_id, posted_ts, skill, bucket FROM raw_must_have
    UNION ALL
    SELECT external_id, posted_ts, skill, bucket FROM raw_good_to_have
  ),

  -- -------------------------------------------------------------------------
  -- Step 3: Apply blocklist and length filters (exact same rules as
  --         analytics_skill_momentum)
  -- -------------------------------------------------------------------------
  filtered AS (
    SELECT external_id, posted_ts, skill, bucket
    FROM raw_all
    WHERE NOT analytics_is_soft_skill(skill)
  ),

  -- -------------------------------------------------------------------------
  -- Step 4: Deduplicate per (external_id, skill, bucket)
  -- A skill appearing multiple times in the same array for the same job
  -- counts only once per bucket. A skill in both arrays for the same job
  -- counts once in each bucket (intentional — shows overlap).
  -- -------------------------------------------------------------------------
  deduped_by_bucket AS (
    SELECT DISTINCT external_id, posted_ts, skill, bucket
    FROM filtered
  ),

  -- -------------------------------------------------------------------------
  -- Step 5: must_have and good_to_have counts — distinct jobs per bucket
  -- -------------------------------------------------------------------------
  must_have_counts AS (
    SELECT
      skill,
      count(DISTINCT external_id) AS must_have
    FROM deduped_by_bucket
    WHERE bucket = 'must_have'
    GROUP BY skill
  ),

  good_to_have_counts AS (
    SELECT
      skill,
      count(DISTINCT external_id) AS good_to_have
    FROM deduped_by_bucket
    WHERE bucket = 'good_to_have'
    GROUP BY skill
  ),

  -- -------------------------------------------------------------------------
  -- Step 6: total — distinct job count across BOTH buckets (deduped per job,
  -- regardless of which bucket the skill appeared in)
  -- -------------------------------------------------------------------------
  total_counts AS (
    SELECT
      skill,
      count(DISTINCT external_id) AS total
    FROM deduped_by_bucket
    GROUP BY skill
  ),

  -- -------------------------------------------------------------------------
  -- Step 7: recent — distinct job count in last 14 days (both buckets, deduped)
  -- -------------------------------------------------------------------------
  recent_counts AS (
    SELECT
      skill,
      count(DISTINCT external_id) AS recent
    FROM deduped_by_bucket
    WHERE posted_ts >= v_now - INTERVAL '14 days'
    GROUP BY skill
  ),

  -- -------------------------------------------------------------------------
  -- Step 8: prior — distinct job count in the prior 14-28 day window
  -- -------------------------------------------------------------------------
  prior_counts AS (
    SELECT
      skill,
      count(DISTINCT external_id) AS prior
    FROM deduped_by_bucket
    WHERE
      posted_ts >= v_now - INTERVAL '28 days'
      AND posted_ts <  v_now - INTERVAL '14 days'
    GROUP BY skill
  ),

  -- -------------------------------------------------------------------------
  -- Step 9: Assemble all metrics per skill, apply total >= 10 threshold
  -- -------------------------------------------------------------------------
  skill_stats AS (
    SELECT
      tc.skill,
      COALESCE(mh.must_have,   0) AS must_have,
      COALESCE(gth.good_to_have, 0) AS good_to_have,
      tc.total,
      COALESCE(rc.recent, 0)    AS recent,
      COALESCE(pc.prior,  0)    AS prior
    FROM total_counts tc
    LEFT JOIN must_have_counts     mh  USING (skill)
    LEFT JOIN good_to_have_counts  gth USING (skill)
    LEFT JOIN recent_counts        rc  USING (skill)
    LEFT JOIN prior_counts         pc  USING (skill)
    WHERE tc.total >= 10
  ),

  -- -------------------------------------------------------------------------
  -- Step 10: Compute growth rate
  --   prior = 0 AND recent > 0  → 100.0  (new entrant)
  --   both zero                 → 0.0
  --   otherwise                 → ROUND(((recent - prior) / prior) * 100, 1)
  -- -------------------------------------------------------------------------
  skill_with_growth AS (
    SELECT
      skill,
      must_have,
      good_to_have,
      total,
      recent,
      prior,
      CASE
        WHEN prior = 0 AND recent > 0 THEN 100.0
        WHEN prior = 0 AND recent = 0 THEN 0.0
        ELSE ROUND(((recent - prior)::numeric / prior) * 100, 1)
      END AS growth
    FROM skill_stats
  )

  -- -------------------------------------------------------------------------
  -- Step 11: Assemble final JSON response
  -- -------------------------------------------------------------------------
  SELECT json_build_object(
    'skills',
    (
      SELECT json_agg(
        json_build_object(
          'skill',         sg.skill,
          'must_have',     sg.must_have,
          'good_to_have',  sg.good_to_have,
          'total',         sg.total,
          'recent',        sg.recent,
          'prior',         sg.prior,
          'growth',        sg.growth
        )
        ORDER BY sg.total DESC
      )
      FROM skill_with_growth sg
    ),
    'dateRange',
    json_build_object(
      'start', to_char((v_now - INTERVAL '28 days')::date, 'YYYY-MM-DD'),
      'end',   to_char(v_now::date,                        'YYYY-MM-DD')
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execution to the authenticated and anon roles used by PostgREST
GRANT EXECUTE ON FUNCTION analytics_skill_gap() TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_skill_gap() TO anon;

-- ---------------------------------------------------------------------------
-- Usage from route.ts:
--   const { data, error } = await sb.rpc("analytics_skill_gap");
--   // data is the full JSON object:
--   // {
--   //   skills: [{ skill, must_have, good_to_have, total, recent, prior, growth }],
--   //   dateRange: { start, end }
--   // }
-- ---------------------------------------------------------------------------
