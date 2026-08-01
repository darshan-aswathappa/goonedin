-- 009_min_exp.sql
-- Adds a structured "minimum years of experience" column used by the
-- dashboard's experience filter.
--
-- Populated by the DeepSeek job analyzer (analysis.min_experience_years),
-- promoted to a dedicated column alongside `salary` and `visa`.
--   NULL  = not yet analyzed / unknown (job is always shown)
--   0     = no experience required, or only a seniority title with no stated years
--   >= 1  = highest REQUIRED years of experience stated in the posting
--
-- No backfill: existing rows stay NULL until naturally re-analyzed.

ALTER TABLE IF EXISTS public.job_analysis_cache
    ADD COLUMN IF NOT EXISTS min_exp integer;

ALTER TABLE IF EXISTS public.scraped_jobs
    ADD COLUMN IF NOT EXISTS min_exp integer;

COMMENT ON COLUMN public.job_analysis_cache.min_exp IS
    'Minimum required years of experience (highest required); 0 if none/seniority-only; NULL if not analyzed.';
COMMENT ON COLUMN public.scraped_jobs.min_exp IS
    'Minimum required years of experience (highest required); 0 if none/seniority-only; NULL if not analyzed.';
