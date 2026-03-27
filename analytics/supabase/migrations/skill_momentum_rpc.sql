-- Migration: analytics_skill_momentum RPC
--
-- PURPOSE
-- -------
-- Replaces the 50,000-row Node.js fetch in skill-momentum/route.ts with a
-- server-side aggregate. All counting is done in Postgres; only the final
-- summarised rows are sent to Node.
--
-- HOW TO APPLY
-- ------------
-- Run this SQL once against your Supabase project (SQL Editor or CLI):
--
--   supabase db push   (if using Supabase CLI migrations)
--   -- OR --
--   Paste into: Supabase Dashboard > SQL Editor > Run
--
-- USAGE FROM ROUTE
-- ----------------
-- Replace the .from("job_analysis_cache").select(...).limit(50000) block in
-- src/app/api/analytics/skill-momentum/route.ts with:
--
--   const { data, error } = await sb.rpc("analytics_skill_momentum");
--
-- The RPC returns rows of shape:
--   { skill: string, day: string, cnt: number }
--
-- The route then reassembles the per-skill daily arrays in JS (same logic,
-- but over a ~100-row result set instead of 50,000 raw rows).
--
-- NOTES ON THE JSONB SCHEMA
-- -------------------------
-- This function assumes job_analysis_cache.analysis is a JSONB object (or a
-- JSON string that Postgres stores as JSONB) with these arrays:
--   analysis->'must_have_keywords'    -- text[]
--   analysis->'good_to_have_keywords' -- text[]
--
-- If the column is stored as a double-encoded JSON string you can unwrap it:
--   COALESCE((analysis #>> '{}')::jsonb->'must_have_keywords', '[]'::jsonb)
-- Adjust as needed based on your actual column type.

CREATE OR REPLACE FUNCTION analytics_skill_momentum()
RETURNS TABLE(skill TEXT, day TEXT, cnt BIGINT)
LANGUAGE sql
STABLE  -- same inputs → same output within one transaction; allows query-plan caching
AS $$
  SELECT
    lower(trim(kw.value))                            AS skill,
    date_trunc('day', jac.created_at)::date::text    AS day,
    count(*)::bigint                                 AS cnt
  FROM job_analysis_cache jac
  -- Unnest must_have_keywords and good_to_have_keywords together
  CROSS JOIN LATERAL jsonb_array_elements_text(
    COALESCE(jac.analysis -> 'must_have_keywords',    '[]'::jsonb) ||
    COALESCE(jac.analysis -> 'good_to_have_keywords', '[]'::jsonb)
  ) AS kw(value)
  WHERE jac.analysis_status = 'completed'
    -- Mirror the JS length guards
    AND length(trim(kw.value)) >= 2
    AND length(trim(kw.value)) <= 50
  GROUP BY 1, 2
  -- Mirror the JS MIN_TOTAL = 20 threshold (across all days, not per-day)
  -- We filter per-skill totals in the wrapping CTE below.
$$;

-- If you want the MIN_TOTAL >= 20 filter pushed into SQL as well, use this
-- version instead (comment out the one above and uncomment this):
--
-- CREATE OR REPLACE FUNCTION analytics_skill_momentum()
-- RETURNS TABLE(skill TEXT, day TEXT, cnt BIGINT)
-- LANGUAGE sql STABLE AS $$
--   WITH raw AS (
--     SELECT
--       lower(trim(kw.value))                          AS skill,
--       date_trunc('day', jac.created_at)::date::text  AS day,
--       count(*)::bigint                               AS cnt
--     FROM job_analysis_cache jac
--     CROSS JOIN LATERAL jsonb_array_elements_text(
--       COALESCE(jac.analysis -> 'must_have_keywords',    '[]'::jsonb) ||
--       COALESCE(jac.analysis -> 'good_to_have_keywords', '[]'::jsonb)
--     ) AS kw(value)
--     WHERE jac.analysis_status = 'completed'
--       AND length(trim(kw.value)) >= 2
--       AND length(trim(kw.value)) <= 50
--     GROUP BY 1, 2
--   ),
--   skill_totals AS (
--     SELECT skill, sum(cnt) AS total FROM raw GROUP BY skill
--   )
--   SELECT r.skill, r.day, r.cnt
--   FROM raw r
--   JOIN skill_totals st ON st.skill = r.skill
--   WHERE st.total >= 20
--   ORDER BY st.total DESC, r.skill, r.day;
-- $$;

-- Recommended index to support this function (if not already present):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jac_status_created
--   ON job_analysis_cache (analysis_status, created_at)
--   WHERE analysis_status = 'completed';
