-- ============================================================
-- MIGRATION 1: Enable pgvector and add embedding column
-- ============================================================
-- Run in Supabase SQL Editor.
-- NOTE: This file uses CREATE INDEX CONCURRENTLY, which cannot run inside
--       a transaction block. The Supabase SQL editor auto-wraps statements
--       in a transaction. Run each statement individually, or use the CLI
--       (e.g. psql) where autocommit is the default.
-- Prerequisites: none
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE job_analysis_cache
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_generated_at TIMESTAMPTZ;

-- HNSW index -- better than IVFFlat for growing datasets
-- IVFFlat needs re-indexing as data grows; HNSW is incremental, 98% recall at any scale
-- m=16, ef_construction=64 are the documented starting parameters for general use
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jac_embedding_hnsw
  ON job_analysis_cache
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
