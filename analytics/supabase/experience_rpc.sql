-- =============================================================================
-- RPC: analytics_experience_distribution
-- Replaces the 50K-row fetch + JS aggregation in experience/route.ts
--
-- What this does in Postgres instead of Node:
--   1. Filters job_analysis_cache to analysis_status = 'completed'
--   2. Unnests minimum_qualifications array from the analysis JSONB column
--   3. Regex-matches year patterns (e.g. "3-5 years", "3+ years")
--   4. Picks the highest year value per job (mirrors JS bestYears logic)
--   5. Buckets into 5 ranges: 0–2, 2–4, 4–6, 6–8, 8+
--   6. Returns distribution, matched count, total count, matchRate
--
-- This covers ALL rows with no cap. Previously Node.js was limited to
-- 50,000 raw rows; this processes every row in the database.
-- =============================================================================

CREATE OR REPLACE FUNCTION analytics_experience_distribution()
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

  -- Step 1: base rows — completed analyses only
  -- NOTE: analysis is a TEXT column holding a plain JSON object, so we parse it
  -- once here via analytics_analysis_jsonb() (NULL-safe on malformed JSON)
  -- before any field access.
  base AS (
    SELECT external_id, analytics_analysis_jsonb(analysis) AS analysis
    FROM job_analysis_cache
    WHERE
      analysis_status = 'completed'
      AND analysis IS NOT NULL
  ),

  -- Step 2: unnest minimum_qualifications, one row per (job, qualification)
  quals AS (
    SELECT
      b.external_id,
      lower(q) AS qual
    FROM base b,
    LATERAL (
      SELECT jsonb_array_elements_text(
        CASE jsonb_typeof(b.analysis->'minimum_qualifications')
          WHEN 'array' THEN b.analysis->'minimum_qualifications'
          ELSE '[]'::jsonb
        END
      )
    ) AS q_unnest(q)
  ),

  -- Step 3: extract year values from each qualification string
  -- Handles: "3-5 years", "3 to 5 years", "3+ years", "3 years"
  extracted AS (
    SELECT
      external_id,
      -- Range match: take average of the two numbers (e.g. "3-5 years" → 4.0)
      CASE
        WHEN qual ~ '\d+\s*(?:to|-|–)\s*\d+\s*\+?\s*year'
        THEN (
          (regexp_match(qual, '(\d+)\s*(?:to|-|–)\s*(\d+)\s*\+?\s*year'))[1]::numeric +
          (regexp_match(qual, '(\d+)\s*(?:to|-|–)\s*(\d+)\s*\+?\s*year'))[2]::numeric
        ) / 2.0
        -- Single / plus match: "3+ years", "3 years"
        WHEN qual ~ '\d+\s*\+?\s*year'
        THEN (regexp_match(qual, '(\d+)\s*\+?\s*year'))[1]::numeric
        ELSE NULL
      END AS years
    FROM quals
  ),

  -- Step 4: keep only valid year values (1–20), pick max per job
  valid AS (
    SELECT external_id, max(years) AS best_years
    FROM extracted
    WHERE years IS NOT NULL AND years > 0 AND years <= 20
    GROUP BY external_id
  ),

  -- Step 5: bucket
  bucketed AS (
    SELECT
      external_id,
      CASE
        WHEN best_years < 2  THEN '0–2 yr'
        WHEN best_years < 4  THEN '2–4 yr'
        WHEN best_years < 6  THEN '4–6 yr'
        WHEN best_years < 8  THEN '6–8 yr'
        ELSE                      '8+ yr'
      END AS bucket
    FROM valid
  ),

  -- Step 6: count per bucket
  bucket_counts AS (
    SELECT bucket, count(*) AS cnt
    FROM bucketed
    GROUP BY bucket
  ),

  -- Totals for matchRate
  totals AS (
    SELECT
      count(*) AS total_jobs,
      (SELECT count(*) FROM valid) AS matched_jobs
    FROM base
  )

  SELECT json_build_object(
    'distribution', (
      SELECT json_agg(
        json_build_object('label', bucket, 'count', cnt)
        ORDER BY
          CASE bucket
            WHEN '0–2 yr' THEN 1
            WHEN '2–4 yr' THEN 2
            WHEN '4–6 yr' THEN 3
            WHEN '6–8 yr' THEN 4
            WHEN '8+ yr'  THEN 5
          END
      )
      FROM bucket_counts
    ),
    'matched',   (SELECT matched_jobs FROM totals),
    'total',     (SELECT total_jobs   FROM totals),
    'matchRate', (
      SELECT CASE
        WHEN total_jobs > 0 THEN round((matched_jobs::numeric / total_jobs) * 100)
        ELSE 0
      END
      FROM totals
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execution to PostgREST roles
GRANT EXECUTE ON FUNCTION analytics_experience_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_experience_distribution() TO anon;

-- ---------------------------------------------------------------------------
-- Usage from route.ts:
--   const { data, error } = await sb.rpc("analytics_experience_distribution");
--   // data is: { distribution, matched, total, matchRate }
-- ---------------------------------------------------------------------------
