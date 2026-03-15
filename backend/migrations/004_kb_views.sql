-- ============================================================
-- MIGRATION 4: Materialized views for expensive aggregations
-- (JSONB unnest on 100K rows = 500ms-2s per query; MV pre-computes it)
-- ============================================================
-- Run in Supabase SQL Editor.
-- Prerequisites: 001_kb_pgvector.sql, 002_kb_indexes.sql, 003_kb_role.sql
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_skill_frequency AS
SELECT
  LOWER(skill) AS skill,
  skill_type,
  COUNT(*)                                                      AS total_count,
  COUNT(*) FILTER (WHERE analyzed_at > NOW() - INTERVAL '7 days')   AS count_7d,
  COUNT(*) FILTER (WHERE analyzed_at > NOW() - INTERVAL '30 days')  AS count_30d,
  MIN(analyzed_at)                                              AS first_seen,
  MAX(analyzed_at)                                              AS last_seen
FROM job_analysis_cache,
  LATERAL (
    SELECT value AS skill, 'must_have' AS skill_type
    FROM jsonb_array_elements_text(
      CASE WHEN analysis ? 'must_have_keywords' THEN analysis->'must_have_keywords' ELSE '[]'::jsonb END
    )
    UNION ALL
    SELECT value AS skill, 'nice_to_have' AS skill_type
    FROM jsonb_array_elements_text(
      CASE WHEN analysis ? 'good_to_have_keywords' THEN analysis->'good_to_have_keywords' ELSE '[]'::jsonb END
    )
  ) skills
WHERE analysis IS NOT NULL AND skill <> ''
GROUP BY LOWER(skill), skill_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_skill_freq_pk
  ON mv_skill_frequency (skill, skill_type);

-- -------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_company_hiring_stats AS
SELECT
  company,
  COUNT(*)                                                        AS total_jobs,
  COUNT(*) FILTER (WHERE posted_at > NOW() - INTERVAL '7 days')  AS jobs_7d,
  COUNT(*) FILTER (WHERE posted_at > NOW() - INTERVAL '30 days') AS jobs_30d,
  COUNT(DISTINCT location)                                        AS location_count,
  COUNT(*) FILTER (WHERE work_model ILIKE '%remote%')            AS remote_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE work_model ILIKE '%remote%') / COUNT(*), 1
  ) AS remote_pct
FROM scraped_jobs
WHERE company IS NOT NULL AND company <> ''
  AND visible = TRUE
GROUP BY company;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_company_stats_pk
  ON mv_company_hiring_stats (company);
CREATE INDEX IF NOT EXISTS idx_mv_company_stats_total
  ON mv_company_hiring_stats (total_jobs DESC);

-- -------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_salary_distribution AS
SELECT
  bucket,
  bucket_order,
  COUNT(*) AS job_count
FROM (
  SELECT
    external_id,
    CASE
      WHEN midpoint < 60000  THEN '<$60K'
      WHEN midpoint < 80000  THEN '$60-80K'
      WHEN midpoint < 100000 THEN '$80-100K'
      WHEN midpoint < 130000 THEN '$100-130K'
      WHEN midpoint < 160000 THEN '$130-160K'
      WHEN midpoint < 200000 THEN '$160-200K'
      ELSE '>$200K'
    END AS bucket,
    CASE
      WHEN midpoint < 60000  THEN 1
      WHEN midpoint < 80000  THEN 2
      WHEN midpoint < 100000 THEN 3
      WHEN midpoint < 130000 THEN 4
      WHEN midpoint < 160000 THEN 5
      WHEN midpoint < 200000 THEN 6
      ELSE 7
    END AS bucket_order
  FROM (
    SELECT
      external_id,
      -- When salary has no dash (e.g. "$150,000"), SPLIT_PART(..., '-', 2) returns ''.
      -- NULLIF converts stripped '' to NULL; COALESCE falls back to part 1 so midpoint = salary itself.
      (
        REGEXP_REPLACE(
          SPLIT_PART(COALESCE(salary, analysis->>'compensation', ''), '-', 1),
          '[^0-9]', '', 'g'
        )::NUMERIC +
        COALESCE(
          NULLIF(
            REGEXP_REPLACE(
              SPLIT_PART(COALESCE(salary, analysis->>'compensation', ''), '-', 2),
              '[^0-9]', '', 'g'
            ),
            ''
          )::NUMERIC,
          REGEXP_REPLACE(
            SPLIT_PART(COALESCE(salary, analysis->>'compensation', ''), '-', 1),
            '[^0-9]', '', 'g'
          )::NUMERIC
        )
      ) / 2 AS midpoint
    FROM job_analysis_cache
    WHERE (salary IS NOT NULL OR analysis ? 'compensation')
      AND COALESCE(salary, analysis->>'compensation', '') ~ '\$?[0-9]'
  ) parsed
  WHERE midpoint > 0
) bucketed
GROUP BY bucket, bucket_order
ORDER BY bucket_order;

-- REFRESH CONCURRENTLY requires a unique index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_salary_dist_pk
  ON mv_salary_distribution (bucket, bucket_order);

-- -------------------------------------------------------

-- Refresh function (called by background worker after analysis batch)
CREATE OR REPLACE FUNCTION refresh_ai_kb_views()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  t0 TIMESTAMPTZ;
  skill_ms FLOAT;
  company_ms FLOAT;
  salary_ms FLOAT;
BEGIN
  t0 = clock_timestamp();
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_frequency;
  skill_ms = EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000;

  t0 = clock_timestamp();
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_company_hiring_stats;
  company_ms = EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000;

  t0 = clock_timestamp();
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_salary_distribution;
  salary_ms = EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000;

  RETURN json_build_object(
    'refreshed_at', NOW(),
    'mv_skill_frequency_ms', skill_ms,
    'mv_company_hiring_stats_ms', company_ms,
    'mv_salary_distribution_ms', salary_ms
  );
END;
$$;

-- ai_kb_reader cannot trigger refreshes -- only backend service role can
REVOKE ALL ON FUNCTION refresh_ai_kb_views() FROM ai_kb_reader;
