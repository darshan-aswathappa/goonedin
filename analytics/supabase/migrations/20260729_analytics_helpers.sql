-- =============================================================================
-- Shared helpers for the analytics_* RPC family
--
-- Context: job_analysis_cache.analysis is a TEXT column holding a plain JSON
-- object (NOT a double-encoded JSON string). Earlier revisions of the analytics
-- RPCs unwrapped it with `(analysis #>> '{}')::jsonb`, which fails outright on a
-- text column:
--     ERROR: operator does not exist: text #>> unknown
-- analytics_analysis_jsonb() is the single, safe unwrap point. It returns NULL
-- rather than raising when a row holds malformed JSON, so one bad row can never
-- take down a whole dashboard panel.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Parse the analysis text column into JSONB, returning NULL on invalid input.
-- IMMUTABLE so it can be used freely inside STABLE aggregate functions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_analysis_jsonb(p_raw text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF p_raw IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN p_raw::jsonb;
EXCEPTION
  WHEN invalid_text_representation OR datatype_mismatch THEN
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Coerce a JSONB value to a JSONB array, returning an empty array for any
-- non-array input (missing key, null, scalar, object).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_jsonb_array(p_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE jsonb_typeof(p_value) WHEN 'array' THEN p_value ELSE '[]'::jsonb END;
$$;

-- ---------------------------------------------------------------------------
-- Soft-skill / noise filter for extracted keywords.
--
-- Mirrors isSoftSkill() in the Next.js analytics routes. Returns TRUE when the
-- keyword should be EXCLUDED from technical skill reporting. Centralised here so
-- the momentum, gap, tech-skill and co-occurrence RPCs cannot drift apart.
--
-- Expects an already lower(trim(...))-normalised keyword.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_is_soft_skill(p_skill text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    p_skill IS NULL
    OR char_length(p_skill) < 2
    OR char_length(p_skill) > 50
    OR p_skill IN (
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
    OR p_skill ~ '\m(communicat|leadership|collaborat|mentor|coach|passion|motivated|enthusias)'
    OR p_skill ~ '\m(stakeholder|interpersonal|organizational|accountability|ownership)'
    OR p_skill ~ '\myears?\s+(of\s+)?experience\M'
    OR p_skill ~ '\mdegree\M';
$$;

-- ---------------------------------------------------------------------------
-- Best-effort posting date for a scraped job.
--
-- Mirrors resolveJobDate() in src/lib/analytics.ts: prefer posted_at (the real
-- posting date) when it is plausible — within the last 730 days and not more
-- than 7 days in the future — otherwise fall back to created_at (scrape time).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_resolved_at(
  p_posted_at  timestamptz,
  p_created_at timestamptz
)
RETURNS timestamptz
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_posted_at IS NOT NULL
     AND p_posted_at >= now() - INTERVAL '730 days'
     AND p_posted_at <= now() + INTERVAL '7 days'
    THEN p_posted_at
    ELSE p_created_at
  END;
$$;

GRANT EXECUTE ON FUNCTION analytics_analysis_jsonb(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_jsonb_array(jsonb)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_is_soft_skill(text)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_resolved_at(timestamptz, timestamptz) TO anon, authenticated;
