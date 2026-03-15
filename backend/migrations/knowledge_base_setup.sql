-- ============================================================
-- GoOneIn Knowledge Base — Database Migration
-- Run this once against your Supabase PostgreSQL database.
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Job embeddings table
--    Stores one embedding per unique job (by external_id).
--    Shares external_id primary key with job_analysis_cache.
CREATE TABLE IF NOT EXISTS job_embeddings (
    external_id     TEXT PRIMARY KEY,
    embedding       vector(1536),          -- text-embedding-3-small dimensions
    embedded_text   TEXT,                  -- the raw text that was embedded (for debugging/re-indexing)
    embedded_at     TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_job_embeddings_cache
        FOREIGN KEY (external_id)
        REFERENCES job_analysis_cache(external_id)
        ON DELETE CASCADE
);

-- 3. IVFFlat index for approximate nearest-neighbor search.
--    lists=100 is appropriate for up to ~1M vectors.
--    For < 100K vectors, use lists=50.
--    For > 1M vectors, use pgvector HNSW index instead.
CREATE INDEX IF NOT EXISTS idx_job_embeddings_ivfflat
    ON job_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- 4. Similarity search function
--    Called from Python via supabase.rpc("match_job_embeddings", {...})
CREATE OR REPLACE FUNCTION match_job_embeddings(
    query_embedding  vector(1536),
    match_threshold  float DEFAULT 0.70,
    match_count      int   DEFAULT 20
)
RETURNS TABLE (
    external_id  TEXT,
    similarity   float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        je.external_id,
        (1 - (je.embedding <=> query_embedding))::float AS similarity
    FROM job_embeddings je
    WHERE (1 - (je.embedding <=> query_embedding)) > match_threshold
    ORDER BY je.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;

-- 5. Add SUPABASE_DB_URL reminder comment
--    (Not an actual SQL change — just documentation)
-- To connect Python directly via asyncpg, add to backend/.env:
--   SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
-- Get this from: Supabase Dashboard → Project Settings → Database → Connection string (URI)
-- Use the "Transaction" pooler (port 6543) for serverless/short-lived connections.

-- 6. Row-level security: embeddings are global (no user_id), read-only for all auth'd users
ALTER TABLE job_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for job embeddings"
    ON job_embeddings
    FOR SELECT
    TO authenticated
    USING (true);

-- Only the service role (backend) can write embeddings
CREATE POLICY "Service role can write job embeddings"
    ON job_embeddings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- Verification queries (run after migration to confirm setup)
-- ============================================================

-- Check extension is active:
-- SELECT * FROM pg_extension WHERE extname = 'vector';

-- Check table exists:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'job_embeddings';

-- Check function exists:
-- SELECT routine_name FROM information_schema.routines WHERE routine_name = 'match_job_embeddings';

-- Test a dummy similarity search (should return 0 rows, not error):
-- SELECT * FROM match_job_embeddings(array_fill(0.0, ARRAY[1536])::vector, 0.70, 5);
