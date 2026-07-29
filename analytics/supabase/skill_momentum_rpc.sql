-- =============================================================================
-- RPC: analytics_skill_momentum
-- Replaces the 50K-row fetch + JS aggregation in skill-momentum/route.ts
--
-- What this does in Postgres instead of Node:
--   1. Filters job_analysis_cache to analysis_status = 'completed'
--   2. Unnests both keyword arrays from the analysis JSONB column
--   3. Lowercases and trims every keyword
--   4. Filters out skills < 2 chars or > 50 chars
--   5. Filters out a soft-skill blocklist
--   6. Groups by skill and by day (date_trunc of created_at)
--   7. Deduplicates: a skill counts at most once per job per day
--      (mirrors the `seen` Set in the original JS loop)
--   8. Discards skills with total < 20 occurrences
--   9. Returns each surviving skill with its total count and a
--      JSON array of {day, count} objects for the daily sparkline
--  10. Also returns a dailyJobs array (jobs per day) so the client
--      can normalise skill frequency against posting volume
--
-- The function is declared STABLE so Postgres can cache results
-- within a transaction and PostgREST can cache at the HTTP layer.
-- =============================================================================

CREATE OR REPLACE FUNCTION analytics_skill_momentum()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  WITH

  -- -----------------------------------------------------------------------
  -- Step 1: Base rows — only completed analyses with a valid timestamp
  -- NOTE: analysis is a TEXT column holding a plain JSON object, so we parse it
  -- once here via analytics_analysis_jsonb() (NULL-safe on malformed JSON)
  -- before any field access.
  -- -----------------------------------------------------------------------
  -- Days are bucketed by the job's POSTING date, not job_analysis_cache.created_at.
  -- Cache created_at records when the analyzer wrote the row, i.e. analyzer
  -- throughput: a backfill of older postings lands them all on one day and spikes
  -- every skill at once. analytics_resolved_at() also keeps this RPC consistent
  -- with analytics_timeline / analytics_weekday / analytics_overview.
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
      (coalesce(p.resolved_at, c.created_at) AT TIME ZONE 'UTC')::date AS day
    FROM job_analysis_cache c
    LEFT JOIN posted p ON p.external_id = c.external_id
    WHERE
      c.analysis_status = 'completed'
      AND c.analysis IS NOT NULL
      AND coalesce(p.resolved_at, c.created_at) IS NOT NULL
  ),

  -- -----------------------------------------------------------------------
  -- Step 2: Unnest both keyword arrays, one row per (job, keyword, day)
  -- Lowercase + trim happens here so all downstream logic is normalised.
  -- -----------------------------------------------------------------------
  raw_keywords AS (
    SELECT
      b.external_id,
      b.day,
      lower(trim(kw)) AS skill
    FROM base b,
    LATERAL (
      SELECT jsonb_array_elements_text(analytics_jsonb_array(b.analysis->'must_have_keywords'))
      UNION ALL
      SELECT jsonb_array_elements_text(analytics_jsonb_array(b.analysis->'good_to_have_keywords'))
    ) AS kw_unnest(kw)
    WHERE b.analysis IS NOT NULL
  ),

  -- -----------------------------------------------------------------------
  -- Step 3: Apply hard filters before any grouping
  --   - Length bounds (2..50 chars)
  --   - Soft-skill blocklist (exact match or regex patterns)
  --   - Degree / years-of-experience patterns
  -- -----------------------------------------------------------------------
  filtered AS (
    SELECT external_id, day, skill
    FROM raw_keywords
    WHERE NOT analytics_is_soft_skill(skill)
  ),

  -- -----------------------------------------------------------------------
  -- Step 4: Deduplicate — each skill counts at most ONCE per job per day
  -- This mirrors the `seen` Set in the JS loop.
  -- -----------------------------------------------------------------------
  deduped AS (
    SELECT DISTINCT external_id, day, skill
    FROM filtered
  ),

  -- -----------------------------------------------------------------------
  -- Step 5: Count per skill per day, then aggregate totals
  -- -----------------------------------------------------------------------
  daily_counts AS (
    SELECT
      skill,
      day,
      count(*) AS day_count
    FROM deduped
    GROUP BY skill, day
  ),

  skill_totals AS (
    SELECT
      skill,
      sum(day_count) AS total
    FROM daily_counts
    GROUP BY skill
  ),

  -- -----------------------------------------------------------------------
  -- Step 6: Keep only skills with total >= 20
  -- -----------------------------------------------------------------------
  qualifying_skills AS (
    SELECT skill, total
    FROM skill_totals
    WHERE total >= 20
  ),

  -- -----------------------------------------------------------------------
  -- Step 7: Build the daily JSON array for each qualifying skill
  -- -----------------------------------------------------------------------
  skill_daily AS (
    SELECT
      qs.skill,
      qs.total,
      jsonb_agg(
        jsonb_build_object('day', to_char(dc.day, 'YYYY-MM-DD'), 'count', dc.day_count)
        ORDER BY dc.day
      ) AS daily
    FROM qualifying_skills qs
    JOIN daily_counts dc USING (skill)
    GROUP BY qs.skill, qs.total
  ),

  -- -----------------------------------------------------------------------
  -- Step 8: Daily job count (total jobs posted per day, denominator for
  -- normalisation in the client chart)
  -- -----------------------------------------------------------------------
  daily_jobs AS (
    SELECT
      day,
      count(DISTINCT external_id) AS job_count
    FROM base
    GROUP BY day
  ),

  -- Date range boundaries
  date_range AS (
    SELECT
      min(day) AS start_day,
      max(day) AS end_day
    FROM daily_jobs
  )

  -- -----------------------------------------------------------------------
  -- Step 9: Assemble final JSON response
  -- -----------------------------------------------------------------------
  SELECT json_build_object(
    'skills',
    (
      SELECT json_agg(
        json_build_object(
          'skill', sd.skill,
          'total', sd.total,
          'daily', sd.daily
        )
        ORDER BY sd.total DESC
      )
      FROM skill_daily sd
    ),
    'dailyJobs',
    (
      SELECT json_agg(
        json_build_object(
          'day', to_char(dj.day, 'YYYY-MM-DD'),
          'count', dj.job_count
        )
        ORDER BY dj.day
      )
      FROM daily_jobs dj
    ),
    'dateRange',
    (
      SELECT CASE
        WHEN dr.start_day IS NULL THEN NULL
        ELSE json_build_object(
          'start', to_char(dr.start_day, 'YYYY-MM-DD'),
          'end',   to_char(dr.end_day,   'YYYY-MM-DD')
        )
      END
      FROM date_range dr
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execution to the authenticated and anon roles used by PostgREST
GRANT EXECUTE ON FUNCTION analytics_skill_momentum() TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_skill_momentum() TO anon;

-- ---------------------------------------------------------------------------
-- Usage from route.ts:
--   const { data, error } = await sb.rpc("analytics_skill_momentum");
--   // data is the full JSON object: { skills, dailyJobs, dateRange }
-- ---------------------------------------------------------------------------
