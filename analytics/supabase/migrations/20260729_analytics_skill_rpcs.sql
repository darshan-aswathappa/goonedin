-- =============================================================================
-- Skill-extraction analytics_* RPCs (aggregates over job_analysis_cache.analysis)
--
-- analysis is a TEXT column holding a plain JSON object with the keys:
--   must_have_keywords, good_to_have_keywords, minimum_qualifications, summary
-- It is parsed through analytics_analysis_jsonb() so a single malformed row
-- degrades to NULL instead of aborting the whole aggregate.
--
-- Casing: keywords are matched case-insensitively but reported using the most
-- frequent original spelling, so "PyTorch" is not flattened to "pytorch".
-- This replaces the ad-hoc uppercase heuristic in aggregateGoodToHave().
--
-- Counts are DISTINCT job counts, not raw occurrences, so a keyword repeated
-- within one posting cannot inflate its own ranking.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- analytics_tech_skills() -> rows of { keyword, count }
-- Consumer: fetchSkills() / skills route -> techSkills
-- Source: must_have_keywords, soft skills removed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_tech_skills()
RETURNS TABLE (keyword text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT external_id, analytics_analysis_jsonb(analysis) AS analysis
    FROM job_analysis_cache
    WHERE analysis_status = 'completed' AND analysis IS NOT NULL
  ),
  raw AS (
    SELECT b.external_id, btrim(kw) AS orig, lower(btrim(kw)) AS norm
    FROM base b,
    LATERAL (
      SELECT jsonb_array_elements_text(analytics_jsonb_array(b.analysis->'must_have_keywords'))
    ) AS kw_unnest(kw)
    WHERE b.analysis IS NOT NULL
  ),
  deduped AS (
    SELECT DISTINCT external_id, norm, orig
    FROM raw
    WHERE NOT analytics_is_soft_skill(norm)
  ),
  totals AS (
    SELECT norm, count(DISTINCT external_id) AS cnt FROM deduped GROUP BY norm
  ),
  best_casing AS (
    SELECT norm, orig,
           row_number() OVER (PARTITION BY norm ORDER BY count(*) DESC, orig ASC) AS rn
    FROM deduped
    GROUP BY norm, orig
  )
  SELECT bc.orig, t.cnt
  FROM totals t
  JOIN best_casing bc ON bc.norm = t.norm AND bc.rn = 1
  ORDER BY t.cnt DESC, bc.orig ASC
  LIMIT 30;
$$;

-- ---------------------------------------------------------------------------
-- analytics_good_to_have() -> rows of { keyword, count }
-- Consumer: fetchSkills() / skills route -> goodToHave
-- Source: good_to_have_keywords, soft skills removed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_good_to_have()
RETURNS TABLE (keyword text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT external_id, analytics_analysis_jsonb(analysis) AS analysis
    FROM job_analysis_cache
    WHERE analysis_status = 'completed' AND analysis IS NOT NULL
  ),
  raw AS (
    SELECT b.external_id, btrim(kw) AS orig, lower(btrim(kw)) AS norm
    FROM base b,
    LATERAL (
      SELECT jsonb_array_elements_text(analytics_jsonb_array(b.analysis->'good_to_have_keywords'))
    ) AS kw_unnest(kw)
    WHERE b.analysis IS NOT NULL
  ),
  deduped AS (
    SELECT DISTINCT external_id, norm, orig
    FROM raw
    WHERE NOT analytics_is_soft_skill(norm)
  ),
  totals AS (
    SELECT norm, count(DISTINCT external_id) AS cnt FROM deduped GROUP BY norm
  ),
  best_casing AS (
    SELECT norm, orig,
           row_number() OVER (PARTITION BY norm ORDER BY count(*) DESC, orig ASC) AS rn
    FROM deduped
    GROUP BY norm, orig
  )
  SELECT bc.orig, t.cnt
  FROM totals t
  JOIN best_casing bc ON bc.norm = t.norm AND bc.rn = 1
  ORDER BY t.cnt DESC, bc.orig ASC
  LIMIT 30;
$$;

-- ---------------------------------------------------------------------------
-- analytics_qualifications() -> rows of { qualification, count }
-- Consumer: fetchSkills() / skills route — the caller regex-matches these raw
-- strings against SOFT_PATTERNS to build the soft-skill breakdown, so the text
-- must be returned verbatim (no soft-skill filtering, no lowercasing).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_qualifications()
RETURNS TABLE (qualification text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT external_id, analytics_analysis_jsonb(analysis) AS analysis
    FROM job_analysis_cache
    WHERE analysis_status = 'completed' AND analysis IS NOT NULL
  ),
  raw AS (
    SELECT b.external_id, btrim(q) AS qualification
    FROM base b,
    LATERAL (
      SELECT jsonb_array_elements_text(analytics_jsonb_array(b.analysis->'minimum_qualifications'))
    ) AS q_unnest(q)
    WHERE b.analysis IS NOT NULL
  ),
  deduped AS (
    SELECT DISTINCT external_id, qualification
    FROM raw
    WHERE qualification <> '' AND char_length(qualification) <= 300
  )
  SELECT d.qualification, count(DISTINCT d.external_id)
  FROM deduped d
  GROUP BY d.qualification
  ORDER BY count(DISTINCT d.external_id) DESC
  LIMIT 2000;
$$;

-- ---------------------------------------------------------------------------
-- analytics_skill_cooccurrence() -> rows of { skill_a, skill_b, pair_count }
-- Consumer: fetchSkills() and the cooccurrence route -> { a, b, count }
-- Unordered pairs are canonicalised as skill_a < skill_b so each pair appears
-- once. Pairs seen in fewer than 3 postings are dropped as noise.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_skill_cooccurrence()
RETURNS TABLE (skill_a text, skill_b text, pair_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT external_id, analytics_analysis_jsonb(analysis) AS analysis
    FROM job_analysis_cache
    WHERE analysis_status = 'completed' AND analysis IS NOT NULL
  ),
  raw AS (
    SELECT b.external_id, lower(btrim(kw)) AS norm
    FROM base b,
    LATERAL (
      SELECT jsonb_array_elements_text(analytics_jsonb_array(b.analysis->'must_have_keywords'))
      UNION ALL
      SELECT jsonb_array_elements_text(analytics_jsonb_array(b.analysis->'good_to_have_keywords'))
    ) AS kw_unnest(kw)
    WHERE b.analysis IS NOT NULL
  ),
  deduped AS (
    SELECT DISTINCT external_id, norm
    FROM raw
    WHERE NOT analytics_is_soft_skill(norm)
  )
  SELECT a.norm, b2.norm, count(*)
  FROM deduped a
  JOIN deduped b2 ON b2.external_id = a.external_id AND a.norm < b2.norm
  GROUP BY a.norm, b2.norm
  HAVING count(*) >= 3
  ORDER BY count(*) DESC, a.norm ASC, b2.norm ASC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION analytics_tech_skills()        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_good_to_have()       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_qualifications()     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_skill_cooccurrence() TO anon, authenticated;
