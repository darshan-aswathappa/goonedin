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
  -- -----------------------------------------------------------------------
  base AS (
    SELECT
      external_id,
      analysis,
      date_trunc('day', created_at)::date AS day
    FROM job_analysis_cache
    WHERE
      analysis_status = 'completed'
      AND created_at IS NOT NULL
      AND analysis IS NOT NULL
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
      SELECT jsonb_array_elements_text(
        CASE jsonb_typeof(b.analysis->'must_have_keywords')
          WHEN 'array' THEN b.analysis->'must_have_keywords'
          ELSE '[]'::jsonb
        END
      )
      UNION ALL
      SELECT jsonb_array_elements_text(
        CASE jsonb_typeof(b.analysis->'good_to_have_keywords')
          WHEN 'array' THEN b.analysis->'good_to_have_keywords'
          ELSE '[]'::jsonb
        END
      )
    ) AS kw_unnest(kw)
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
    WHERE
      -- Length guard
      char_length(skill) >= 2
      AND char_length(skill) <= 50

      -- Exact blocklist (covers the most common offenders cheaply)
      AND skill NOT IN (
        'communication', 'communication skills', 'written communication',
        'teamwork', 'collaboration', 'collaborative', 'team player',
        'problem solving', 'problem-solving', 'analytical thinking',
        'leadership', 'mentoring', 'coaching', 'mentorship',
        'agile', 'scrum', 'agile/scrum', 'agile methodologies',
        'detail-oriented', 'detail oriented', 'attention to detail',
        'self-starter', 'self-motivated', 'self starter',
        'time management', 'project management',
        'critical thinking', 'creative thinking',
        'fast-paced', 'fast-paced environment', 'fast paced',
        'cross-functional', 'cross functional',
        'adaptability', 'flexibility', 'adaptable',
        'ownership', 'accountability',
        'presentation skills', 'public speaking',
        'english fluency', 'english', 'bilingual',
        'recruitment', 'hiring', 'onboarding',
        'commercialization', 'business development', 'sales',
        'stakeholder management', 'client-facing', 'client facing',
        'strategic thinking', 'strategy', 'strategic planning',
        'organizational skills', 'multitasking', 'multi-tasking',
        'interpersonal skills', 'negotiation', 'conflict resolution',
        'remote work', 'hybrid', 'on-site',
        'bachelor''s degree', 'master''s degree', 'phd', 'degree',
        'years of experience', 'experience', 'proven track record',
        'passion', 'passionate', 'enthusiastic', 'motivated',
        'excellent communication', 'strong communication',
        'team-oriented', 'results-driven', 'results driven',
        'waterfall', 'technical team leadership', 'technical leadership',
        'technical writing', 'lustre', 'lustre development'
      )

      -- Regex-based soft-skill patterns (mirrors isSoftSkill() in route.ts)
      AND skill !~ '\m(communicat|leadership|collaborat|mentor|coach|passion|motivated|enthusias)'
      AND skill !~ '\m(stakeholder|interpersonal|organizational|accountability|ownership)'
      AND skill !~ '\myears?\s+(of\s+)?experience\M'
      AND skill !~ '\mdegree\M'
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
