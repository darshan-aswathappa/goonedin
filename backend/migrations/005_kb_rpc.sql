-- ============================================================
-- MIGRATION 5: Semantic search RPC function
-- ============================================================
-- Run in Supabase SQL Editor.
-- Prerequisites: 001_kb_pgvector.sql, 003_kb_role.sql
-- ============================================================

CREATE OR REPLACE FUNCTION search_jobs_by_embedding(
  query_embedding   vector(1536),
  match_count       INT     DEFAULT 20,
  similarity_threshold FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  external_id  TEXT,
  job_url      TEXT,
  salary       TEXT,
  visa         TEXT,
  summary      TEXT,
  must_have    JSONB,
  similarity   FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    jac.external_id,
    jac.job_url,
    jac.salary,
    jac.visa,
    jac.analysis->>'summary'            AS summary,
    jac.analysis->'must_have_keywords'  AS must_have,
    (1 - (jac.embedding <=> query_embedding))::FLOAT AS similarity
  FROM job_analysis_cache jac
  WHERE jac.embedding IS NOT NULL
    AND jac.analysis_status = 'completed'
    AND (1 - (jac.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY jac.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION search_jobs_by_embedding TO ai_kb_reader;
