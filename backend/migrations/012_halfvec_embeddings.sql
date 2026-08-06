-- 012_halfvec_embeddings.sql
--
-- Halves the embedding footprint by storing vectors as fp16 instead of fp32.
--
-- job_analysis_cache TOAST is 177 MB, of which pg_column_size accounts for
-- 130 MB of embedding and 22 MB of analysis text. halfvec(1536) is 3,076 bytes
-- per row versus 6,152 for vector(1536), so the embedding share drops to ~65 MB.
--
-- Accuracy: these are OpenAI text-embedding-3-small outputs, L2-normalised with
-- components around +/-0.05 -- comfortably inside fp16's representable range, well
-- away from both overflow and subnormal territory. Measured recall@10 loss for
-- fp16 quantisation on normalised embeddings is under 0.5%. No re-embedding is
-- required; this is a pure storage-format change.
--
-- Requires pgvector >= 0.7. This project runs 0.8.2 (verified 2026-08-06).
--
-- NOTE: ALTER COLUMN TYPE rewrites the table and its TOAST. Peak usage during the
-- rewrite is roughly current_size + new_size (~320 MB + ~120 MB = ~440 MB), which
-- fits under the 500 MB ceiling only because migration 011 already freed 195 MB.
-- Run 011 first.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Convert the column
-- ---------------------------------------------------------------------------
-- Rollback: ALTER TABLE job_analysis_cache
--             ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector(1536);
--           (fp32 precision is not recovered by converting back -- the discarded
--            mantissa bits are gone. Values remain valid, just quantised.)
ALTER TABLE job_analysis_cache
    ALTER COLUMN embedding TYPE halfvec(1536)
    USING embedding::halfvec(1536);

-- ---------------------------------------------------------------------------
-- 2. Teach the retrieval RPC about the new type
-- ---------------------------------------------------------------------------
-- The signature deliberately keeps `query_embedding vector` so no application code
-- changes: backend/app/services/knowledge_base/embeddings.py:275 passes a plain
-- float list and PostgREST coerces it to `vector`. The cast to halfvec happens
-- inside, because pgvector has no halfvec <=> vector operator -- without the cast
-- this function would fail at runtime with "operator does not exist".
CREATE OR REPLACE FUNCTION public.search_jobs_by_embedding(
    query_embedding      vector,
    match_count          integer DEFAULT 20,
    similarity_threshold double precision DEFAULT 0.6
)
RETURNS TABLE(
    external_id text,
    job_url     text,
    salary      text,
    visa        text,
    summary     text,
    must_have   jsonb,
    similarity  double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  WITH q AS (SELECT query_embedding::halfvec(1536) AS v)
  SELECT
    jac.external_id,
    jac.job_url,
    jac.salary,
    jac.visa,
    (jac.analysis::jsonb)->>'summary'            AS summary,
    (jac.analysis::jsonb)->'must_have_keywords'  AS must_have,
    (1 - (jac.embedding <=> q.v))::FLOAT         AS similarity
  FROM job_analysis_cache jac, q
  WHERE jac.embedding IS NOT NULL
    AND jac.analysis_status = 'completed'
    AND (1 - (jac.embedding <=> q.v)) >= similarity_threshold
  ORDER BY jac.embedding <=> q.v
  LIMIT match_count;
$function$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Deliberately NOT recreating the HNSW index.
-- ---------------------------------------------------------------------------
-- idx_jac_embedding_hnsw was 166 MB and had idx_scan = 0 across a 22-day stats
-- window that covered the entire lifetime of the data -- it never served a query.
-- search_jobs_by_embedding works without it via sequential scan; at ~23k rows and
-- 65 MB of halfvec data that is well under a second.
--
-- If semantic search ever takes real traffic, recreate it as halfvec (~83 MB, half
-- the original) and re-check pg_stat_user_indexes to confirm it is actually used:
--
--   CREATE INDEX CONCURRENTLY idx_jac_embedding_hnsw
--     ON job_analysis_cache USING hnsw (embedding halfvec_cosine_ops)
--     WITH (m = 16, ef_construction = 64);
--
-- Post-migration (cannot run inside a transaction):
--   VACUUM (ANALYZE) job_analysis_cache;
