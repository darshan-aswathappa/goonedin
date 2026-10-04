-- 014_remove_analytics.sql
--
-- Analytics (analytics.goonedin.xyz dashboard, frontend /analytics page) and
-- the AI knowledge base / companion were removed from the product; only the
-- job feed remains. This drops every DB object that existed solely for them.
-- Job tables (scraped_jobs, job_analysis_cache, job_analysis_queue,
-- greenhouse_*, saved_jobs, custom_source*, resumes) are kept.
--
-- Also fixes idx_scraped_jobs_external_id: it was created UNIQUE on
-- external_id alone, which contradicts the real key (user_id, source,
-- external_id) and made a second user's insert of a shared job fail with
-- 23505 — that user silently never received the job.
--
-- Run VACUUM FULL job_analysis_cache afterwards: dropping the embedding
-- column only hides it; the 1536-dim vectors stay on disk until a rewrite.

BEGIN;

-- 1. Analytics RPCs + helpers (analytics/ app, AI SQL allowlist)
DROP FUNCTION IF EXISTS analytics_experience_distribution();
DROP FUNCTION IF EXISTS analytics_good_to_have();
DROP FUNCTION IF EXISTS analytics_hourly_by_day();
DROP FUNCTION IF EXISTS analytics_hourly_distribution();
DROP FUNCTION IF EXISTS analytics_locations();
DROP FUNCTION IF EXISTS analytics_overview();
DROP FUNCTION IF EXISTS analytics_qualifications();
DROP FUNCTION IF EXISTS analytics_queue_health();
DROP FUNCTION IF EXISTS analytics_salary_strings();
DROP FUNCTION IF EXISTS analytics_skill_cooccurrence();
DROP FUNCTION IF EXISTS analytics_skill_gap();
DROP FUNCTION IF EXISTS analytics_skill_momentum();
DROP FUNCTION IF EXISTS analytics_sources();
DROP FUNCTION IF EXISTS analytics_tech_skills();
DROP FUNCTION IF EXISTS analytics_timeline(integer, text);
DROP FUNCTION IF EXISTS analytics_titles();
DROP FUNCTION IF EXISTS analytics_top_companies();
DROP FUNCTION IF EXISTS analytics_visa();
DROP FUNCTION IF EXISTS analytics_weekday();
DROP FUNCTION IF EXISTS analytics_analysis_jsonb(text);
DROP FUNCTION IF EXISTS analytics_is_soft_skill(text);
DROP FUNCTION IF EXISTS analytics_jsonb_array(jsonb);
DROP FUNCTION IF EXISTS analytics_resolved_at(timestamptz, timestamptz);

DROP TABLE IF EXISTS blocked_analytics_companies;

-- 2. Knowledge base: materialized views, sessions, semantic search, embeddings
DROP FUNCTION IF EXISTS refresh_ai_kb_views();
DROP FUNCTION IF EXISTS cleanup_expired_ai_kb_sessions();
DROP FUNCTION IF EXISTS search_jobs_by_embedding(vector, integer, double precision);

DROP MATERIALIZED VIEW IF EXISTS mv_skill_frequency;
DROP MATERIALIZED VIEW IF EXISTS mv_company_hiring_stats;
DROP MATERIALIZED VIEW IF EXISTS mv_salary_distribution;

DROP TABLE IF EXISTS ai_kb_messages;
DROP TABLE IF EXISTS ai_kb_sessions;

ALTER TABLE job_analysis_cache
    DROP COLUMN IF EXISTS embedding,
    DROP COLUMN IF EXISTS embedding_generated_at;

-- 3. Indexes that only served analytics queries (idx_scan 0 or near-0)
DROP INDEX IF EXISTS idx_sj_posted_at;
DROP INDEX IF EXISTS idx_jac_status_created_at;
DROP INDEX IF EXISTS idx_scraped_jobs_company_created_at;
DROP INDEX IF EXISTS idx_scraped_jobs_salary_not_null;
DROP INDEX IF EXISTS idx_sj_company_lower;
DROP INDEX IF EXISTS idx_sj_work_model;

-- 4. Replace the UNIQUE external_id index with a plain one. The backend
--    still filters/updates scraped_jobs by external_id heavily, so keep an
--    index; uniqueness is enforced by scraped_jobs_user_id_source_external_id_key.
CREATE INDEX IF NOT EXISTS idx_scraped_jobs_external_id_nonuniq
    ON scraped_jobs (external_id);
DROP INDEX IF EXISTS idx_scraped_jobs_external_id;
ALTER INDEX idx_scraped_jobs_external_id_nonuniq
    RENAME TO idx_scraped_jobs_external_id;

COMMIT;

-- 5. AI query roles (read-only SQL layer). Outside the transaction so a
--    failure here (e.g. grants held by another owner) doesn't undo the above.
--    DROP OWNED requires membership in the role, hence the temporary grant.
GRANT ai_query_user, ai_kb_reader TO postgres;
DROP OWNED BY ai_query_user, ai_kb_reader;
REVOKE ai_query_user, ai_kb_reader FROM postgres;
DROP ROLE IF EXISTS ai_query_user;
DROP ROLE IF EXISTS ai_kb_reader;
