-- =============================================================================
-- Core analytics_* RPCs (job-level aggregates over scraped_jobs)
--
-- These functions had only ever existed as ad-hoc definitions inside the old
-- Supabase project; they were never captured as migrations, so recreating the
-- project dropped all of them and every dashboard panel silently rendered empty
-- (each fetcher in src/lib/analytics-fetchers.ts wraps its RPC call in
-- `try/catch { return null }`).
--
-- Contracts are dictated by the existing consumers — do not change the returned
-- column names or JSON keys without updating src/lib/analytics-fetchers.ts and
-- the matching route handlers under src/app/api/analytics/.
--
-- Conventions shared across the family:
--   * Rows are deduplicated on external_id, earliest created_at winning, to
--     mirror deduplicateJobs() in src/lib/analytics.ts.
--   * "Posting date" uses analytics_resolved_at() (posted_at when plausible,
--     else created_at), mirroring resolveJobDate().
--   * Hour-of-day metrics deliberately use created_at (scrape time) in UTC,
--     because posted_at is frequently date-only and carries no usable hour.
--   * Blocked-company filtering is intentionally NOT done here; callers apply
--     it in JS via getBlockedCompanies()/isBlocked().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- analytics_overview() -> JSON object
-- Consumer: fetchOverview(), fetchSalary() (reads .total only)
-- Shape: { total, uniqueCompanies, analyzed, jobs30d, avgJobsPerDay }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_overview()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT DISTINCT ON (external_id)
      external_id, company,
      analytics_resolved_at(posted_at, created_at) AS resolved_at
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  )
  SELECT json_build_object(
    'total',           (SELECT count(*) FROM jobs),
    'uniqueCompanies', (SELECT count(DISTINCT company) FROM jobs
                        WHERE company IS NOT NULL AND btrim(company) <> ''),
    'analyzed',        (SELECT count(*) FROM jobs j
                        WHERE EXISTS (
                          SELECT 1 FROM job_analysis_cache c
                          WHERE c.external_id = j.external_id
                            AND c.analysis_status = 'completed'
                        )),
    'jobs30d',         (SELECT count(*) FROM jobs
                        WHERE resolved_at >= now() - INTERVAL '30 days'),
    'avgJobsPerDay',   (SELECT round(
                          count(*) FILTER (WHERE resolved_at >= now() - INTERVAL '30 days')::numeric
                          / 30.0, 1)
                        FROM jobs)
  );
$$;

-- ---------------------------------------------------------------------------
-- analytics_top_companies() -> rows of { company, count }
-- Consumers: fetchCompanies(), fetchHiringVelocity() (slices top 5)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_top_companies()
RETURNS TABLE (company text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT DISTINCT ON (external_id) external_id, company
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  )
  SELECT btrim(j.company), count(*)
  FROM jobs j
  WHERE j.company IS NOT NULL AND btrim(j.company) <> ''
  GROUP BY btrim(j.company)
  ORDER BY count(*) DESC, btrim(j.company) ASC
  LIMIT 100;
$$;

-- ---------------------------------------------------------------------------
-- analytics_hourly_distribution() -> rows of { hour, count }
-- Consumer: fetchCompanies() / companies route (backfills missing hours to 0)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_hourly_distribution()
RETURNS TABLE (hour integer, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT DISTINCT ON (external_id) external_id, created_at
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  )
  SELECT extract(hour FROM j.created_at AT TIME ZONE 'UTC')::int, count(*)
  FROM jobs j
  WHERE j.created_at IS NOT NULL
  GROUP BY 1
  ORDER BY 1;
$$;

-- ---------------------------------------------------------------------------
-- analytics_hourly_by_day() -> rows of { dow, hour, count }
-- Consumer: hourly-by-day route (dow 0=Sunday, matches JS getUTCDay())
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_hourly_by_day()
RETURNS TABLE (dow integer, hour integer, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT DISTINCT ON (external_id) external_id, created_at
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  )
  SELECT
    extract(dow  FROM j.created_at AT TIME ZONE 'UTC')::int,
    extract(hour FROM j.created_at AT TIME ZONE 'UTC')::int,
    count(*)
  FROM jobs j
  WHERE j.created_at IS NOT NULL
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

-- ---------------------------------------------------------------------------
-- analytics_weekday() -> rows of { dow, day_name, count }
-- Consumer: fetchWeekday() (dow 0=Sunday). Uses resolved posting date, matching
-- aggregateWeekday()'s `posted_at || created_at` preference.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_weekday()
RETURNS TABLE (dow integer, day_name text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT DISTINCT ON (external_id)
      external_id, analytics_resolved_at(posted_at, created_at) AS resolved_at
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  )
  SELECT
    extract(dow FROM j.resolved_at AT TIME ZONE 'UTC')::int,
    btrim(to_char(j.resolved_at AT TIME ZONE 'UTC', 'Dy')),
    count(*)
  FROM jobs j
  WHERE j.resolved_at IS NOT NULL
  GROUP BY 1, 2
  ORDER BY 1;
$$;

-- ---------------------------------------------------------------------------
-- analytics_timeline(p_days, p_source) -> rows of { day, count }
-- Consumer: fetchTimeline() and timeline route; day is 'YYYY-MM-DD' text and
-- gaps are backfilled client-side by fillDateRange().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_timeline(
  p_days   integer DEFAULT 30,
  p_source text    DEFAULT NULL
)
RETURNS TABLE (day text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT DISTINCT ON (external_id)
      external_id, source,
      analytics_resolved_at(posted_at, created_at) AS resolved_at
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  )
  SELECT to_char((j.resolved_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD'), count(*)
  FROM jobs j
  WHERE j.resolved_at IS NOT NULL
    AND j.resolved_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
    AND (p_source IS NULL OR j.source = p_source)
  GROUP BY 1
  ORDER BY 1;
$$;

-- ---------------------------------------------------------------------------
-- analytics_sources() -> rows of { source, count }
-- Consumer: sources route (maps source name to a brand colour)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_sources()
RETURNS TABLE (source text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT DISTINCT ON (external_id) external_id, source
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  )
  SELECT coalesce(nullif(btrim(j.source), ''), 'Unknown'), count(*)
  FROM jobs j
  GROUP BY 1
  ORDER BY count(*) DESC;
$$;

-- ---------------------------------------------------------------------------
-- analytics_locations() -> rows of { location, count }
-- Consumer: fetchLocations() (normalizeLocation() + country filtering in JS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_locations()
RETURNS TABLE (location text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT DISTINCT ON (external_id) external_id, location
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  )
  SELECT btrim(j.location), count(*)
  FROM jobs j
  WHERE j.location IS NOT NULL AND btrim(j.location) <> ''
  GROUP BY btrim(j.location)
  ORDER BY count(*) DESC
  LIMIT 2000;
$$;

-- ---------------------------------------------------------------------------
-- analytics_titles() -> rows of { title, count }
-- Consumer: fetchSeniority() — expands counts back into rows, then runs
-- aggregateSeniority / aggregateTitleKeywords / aggregateJobFunctions in JS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_titles()
RETURNS TABLE (title text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT DISTINCT ON (external_id) external_id, title
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  )
  SELECT btrim(j.title), count(*)
  FROM jobs j
  WHERE j.title IS NOT NULL AND btrim(j.title) <> ''
  GROUP BY btrim(j.title)
  ORDER BY count(*) DESC
  LIMIT 5000;
$$;

-- ---------------------------------------------------------------------------
-- analytics_visa() -> rows of { visa, count }
-- Consumer: fetchVisa() / visa route. NULL visa is emitted as the sentinel
-- '__null__', which the caller maps back to null before aggregateVisa().
-- Falls back to job_analysis_cache.visa when scraped_jobs.visa is unset, since
-- the analyzer writes its verdict to the cache.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_visa()
RETURNS TABLE (visa text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT DISTINCT ON (external_id) external_id, visa
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  ),
  resolved AS (
    SELECT coalesce(nullif(btrim(j.visa), ''), nullif(btrim(c.visa), '')) AS visa
    FROM jobs j
    LEFT JOIN job_analysis_cache c ON c.external_id = j.external_id
  )
  SELECT coalesce(r.visa, '__null__'), count(*)
  FROM resolved r
  GROUP BY 1
  ORDER BY count(*) DESC;
$$;

-- ---------------------------------------------------------------------------
-- analytics_salary_strings() -> rows of { salary, count }
-- Consumer: fetchSalary() / salary route — expands counts back into synthetic
-- rows (capped at 50k) and runs aggregateSalary() in JS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_salary_strings()
RETURNS TABLE (salary text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT DISTINCT ON (external_id) external_id, salary
    FROM scraped_jobs
    ORDER BY external_id, created_at ASC
  ),
  resolved AS (
    SELECT coalesce(nullif(btrim(j.salary), ''), nullif(btrim(c.salary), '')) AS salary
    FROM jobs j
    LEFT JOIN job_analysis_cache c ON c.external_id = j.external_id
  )
  SELECT r.salary, count(*)
  FROM resolved r
  WHERE r.salary IS NOT NULL
  GROUP BY r.salary
  ORDER BY count(*) DESC
  LIMIT 5000;
$$;

-- ---------------------------------------------------------------------------
-- analytics_queue_health() -> JSON object
-- Consumer: fetchQueue() / queue route
-- Shape: { completed, failed, pending, total, withVisa, withSalary, analyzedCount }
-- 'pending' folds in in-flight ('processing') rows so the three status buckets
-- always sum to total.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_queue_health()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'completed', (SELECT count(*) FROM job_analysis_queue WHERE status = 'completed'),
    'failed',    (SELECT count(*) FROM job_analysis_queue WHERE status = 'failed'),
    'pending',   (SELECT count(*) FROM job_analysis_queue
                  WHERE status NOT IN ('completed', 'failed')),
    'total',     (SELECT count(*) FROM job_analysis_queue),
    'withVisa',  (SELECT count(*) FROM job_analysis_cache
                  WHERE visa IS NOT NULL AND btrim(visa) <> ''),
    'withSalary',(SELECT count(*) FROM job_analysis_cache
                  WHERE salary IS NOT NULL AND btrim(salary) <> ''),
    'analyzedCount', (SELECT count(*) FROM job_analysis_cache
                      WHERE analysis_status = 'completed')
  );
$$;

GRANT EXECUTE ON FUNCTION analytics_overview()            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_companies()       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_hourly_distribution() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_hourly_by_day()       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_weekday()             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_timeline(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_sources()             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_locations()           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_titles()              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_visa()                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_salary_strings()      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_queue_health()        TO anon, authenticated;
