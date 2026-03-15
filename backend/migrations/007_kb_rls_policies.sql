-- ============================================================
-- MIGRATION 7: RLS policies for ai_kb_reader role
-- ============================================================
-- Run in Supabase SQL Editor.
-- Prerequisites: 003_kb_role.sql
--
-- PROBLEM: Migration 003 grants BYPASSRLS to ai_kb_reader, but
-- Supabase only honors BYPASSRLS for superuser roles (postgres,
-- service_role). When the SQL executor does SET ROLE ai_kb_reader,
-- RLS kicks in and returns 0 rows because there are no policies
-- for this role.
--
-- FIX: Add permissive SELECT policies for ai_kb_reader on every
-- table it needs to read. These are unrestricted (all rows) because
-- the role is used for aggregate analytics, not per-user queries.
-- The Python security layer handles table-level restrictions.
-- ============================================================

-- job_analysis_cache — global cache, no user_id, no PII
CREATE POLICY ai_kb_reader_select ON job_analysis_cache
  FOR SELECT TO ai_kb_reader
  USING (true);

-- scraped_jobs — needed for company stats, joins with analysis cache
CREATE POLICY ai_kb_reader_select ON scraped_jobs
  FOR SELECT TO ai_kb_reader
  USING (true);

-- custom_sources — needed for source status queries
CREATE POLICY ai_kb_reader_select ON custom_sources
  FOR SELECT TO ai_kb_reader
  USING (true);

-- custom_source_jobs — needed for custom source job queries
CREATE POLICY ai_kb_reader_select ON custom_source_jobs
  FOR SELECT TO ai_kb_reader
  USING (true);

-- saved_jobs — needed for saved job queries
CREATE POLICY ai_kb_reader_select ON saved_jobs
  FOR SELECT TO ai_kb_reader
  USING (true);

-- job_analysis_queue — needed for queue health queries
CREATE POLICY ai_kb_reader_select ON job_analysis_queue
  FOR SELECT TO ai_kb_reader
  USING (true);

-- Materialized views don't have RLS, but grant SELECT just in case
-- they were not covered by the original migration
GRANT SELECT ON mv_skill_frequency TO ai_kb_reader;
GRANT SELECT ON mv_company_hiring_stats TO ai_kb_reader;
GRANT SELECT ON mv_salary_distribution TO ai_kb_reader;
