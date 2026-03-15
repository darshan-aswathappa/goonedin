-- ============================================================
-- MIGRATION 2: Performance indexes for AI-generated queries
-- ============================================================
-- Run in Supabase SQL Editor.
-- NOTE: This file uses CREATE INDEX CONCURRENTLY, which cannot run inside
--       a transaction block. The Supabase SQL editor auto-wraps statements
--       in a transaction. Run each statement individually, or use the CLI
--       (e.g. psql) where autocommit is the default.
-- Prerequisites: 001_kb_pgvector.sql
-- ============================================================

-- Trigram indexes for LIKE/ILIKE company and title searches
-- (LLM generates "WHERE company ILIKE '%stripe%'" constantly)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sj_company_trgm
  ON scraped_jobs USING gin (company gin_trgm_ops)
  WHERE company IS NOT NULL AND company <> '';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sj_title_trgm
  ON scraped_jobs USING gin (title gin_trgm_ops)
  WHERE title IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sj_company_lower
  ON scraped_jobs (lower(company))
  WHERE company IS NOT NULL AND company <> '';

-- Time-range indexes for date-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sj_posted_at
  ON scraped_jobs (posted_at DESC)
  WHERE posted_at IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jac_analyzed_at
  ON job_analysis_cache (analyzed_at DESC);

-- GIN index on analysis JSONB for keyword containment queries
-- Enables: analysis @> '{"must_have_keywords": ["Python"]}'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jac_analysis_gin
  ON job_analysis_cache USING gin (analysis);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sj_analysis_gin
  ON scraped_jobs USING gin (analysis);

-- Work model and source lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sj_work_model
  ON scraped_jobs (work_model)
  WHERE work_model IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sj_source
  ON scraped_jobs (source);
