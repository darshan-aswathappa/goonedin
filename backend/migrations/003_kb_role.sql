-- ============================================================
-- MIGRATION 3: Read-only role for AI SQL execution
-- ============================================================
-- Run in Supabase SQL Editor.
-- Prerequisites: 001_kb_pgvector.sql, 002_kb_indexes.sql
-- NOTE: Replace 'your-strong-password' with a real password
--       before running this migration.
-- ============================================================

-- Create role (no login -- Python connects as service_role and SET ROLE)
CREATE ROLE ai_kb_reader;

-- Schema access
GRANT USAGE ON SCHEMA public TO ai_kb_reader;

-- Grant SELECT on safe tables only
GRANT SELECT ON scraped_jobs TO ai_kb_reader;
GRANT SELECT ON job_analysis_cache TO ai_kb_reader;
GRANT SELECT ON custom_sources TO ai_kb_reader;
GRANT SELECT ON custom_source_jobs TO ai_kb_reader;
GRANT SELECT ON saved_jobs TO ai_kb_reader;
GRANT SELECT ON job_analysis_queue TO ai_kb_reader;

-- Explicitly revoke PII tables even if default privileges grant them
REVOKE ALL ON user_resumes FROM ai_kb_reader;
REVOKE ALL ON resume_analysis FROM ai_kb_reader;
REVOKE ALL ON resume_analysis_queue FROM ai_kb_reader;
REVOKE ALL ON user_settings FROM ai_kb_reader;

-- Prevent future tables from being auto-granted
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT ON TABLES FROM ai_kb_reader;

-- BYPASSRLS: needed so aggregate queries work across all users
-- (RLS filters by auth.uid() = user_id; AI answering market questions needs all rows)
-- NOTE: Supabase ignores BYPASSRLS for non-superuser roles. You MUST also run
-- migration 007_kb_rls_policies.sql to add explicit SELECT policies.
ALTER ROLE ai_kb_reader BYPASSRLS;

-- Create login user for AI_READONLY_DB_URL connection
CREATE USER ai_query_user WITH PASSWORD 'your-strong-password';
GRANT ai_kb_reader TO ai_query_user;
