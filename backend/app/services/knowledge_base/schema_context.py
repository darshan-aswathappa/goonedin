"""
NL2SQL schema context string for the GoOneIn knowledge base.

This is the single most critical piece of the NL2SQL pipeline — 70% of accuracy
comes from how precisely the LLM understands the schema. This module defines:
  - Exact DDL with column-level descriptions
  - JSONB access patterns (the most common LLM failure point on PostgreSQL)
  - Table routing rules (when to use which table)
  - Date arithmetic patterns
  - Deduplication guidance
  - Grounding Q&A examples
"""

# ---------------------------------------------------------------------------
# SCHEMA CONTEXT — injected verbatim into every NL2SQL system prompt
# ---------------------------------------------------------------------------

SCHEMA_CONTEXT = """
=== DATABASE SCHEMA CONTEXT ===

You are querying a PostgreSQL database (via Supabase). Follow every rule below exactly.

=== FAST PATH: USE THESE FIRST ===

Before writing raw SQL, check if one of these pre-built helpers answers the question.
They are faster, pre-blocked-company-filtered, and already optimized.

MATERIALIZED VIEWS (instant reads, refreshed after each analysis batch):
  mv_skill_frequency         → columns: skill TEXT, skill_type TEXT ('must_have'|'good_to_have'), job_count BIGINT
  mv_company_hiring_stats    → columns: company, total_jobs, source_count, sources TEXT[], location_count,
                                        locations TEXT[], visa_mention_pct NUMERIC, salary_mention_pct NUMERIC,
                                        first_seen_at, last_seen_at, jobs_last_30d BIGINT
  mv_salary_distribution     → columns: bucket TEXT, bucket_order INT, job_count BIGINT, avg_salary_low NUMERIC,
                                        min_salary INT, max_salary INT, sample_raw_salaries TEXT[]
  Buckets: under_60k | 60k_80k | 80k_100k | 100k_120k | 120k_150k | 150k_180k | 180k_220k | 220k_plus | unparseable

RPC FUNCTIONS (call via SELECT * FROM function_name(...)):
  analytics_overview()                      → jsonb with total, uniqueCompanies, analyzed, jobs30d, avgJobsPerDay
  analytics_tech_skills()                   → TABLE(keyword TEXT, count BIGINT)
  analytics_good_to_have()                  → TABLE(keyword TEXT, count BIGINT)
  analytics_top_companies()                 → TABLE(company TEXT, count BIGINT)
  analytics_locations()                     → TABLE(location TEXT, count BIGINT)
  analytics_visa()                          → TABLE(visa TEXT, count BIGINT)
  analytics_salary_strings()                → TABLE(salary TEXT, count BIGINT)
  analytics_qualifications()                → TABLE(qualification TEXT, count BIGINT)
  analytics_timeline(p_days INT, p_source TEXT) → TABLE(day DATE, count BIGINT)
  analytics_sources()                       → TABLE(source TEXT, count BIGINT)
  analytics_weekday()                       → TABLE(dow INT, day_name TEXT, count BIGINT)
  analytics_skill_cooccurrence()            → TABLE(skill_a TEXT, skill_b TEXT, pair_count BIGINT)
  analytics_queue_health()                  → jsonb
  search_jobs_by_keywords(keywords TEXT[], match_count INT, require_all BOOL)
                                            → TABLE(external_id, job_url, title, company, location, posted_at,
                                                    salary, visa, matched_keywords TEXT[], match_score INT)
  get_job_detail(p_external_id TEXT)        → TABLE with full analysis fields unpacked

EXAMPLES USING FAST PATH:
  Q: Top skills?          → SELECT * FROM mv_skill_frequency WHERE skill_type = 'must_have' ORDER BY job_count DESC LIMIT 20;
  Q: Companies hiring?    → SELECT company, total_jobs, jobs_last_30d FROM mv_company_hiring_stats ORDER BY total_jobs DESC LIMIT 20;
  Q: Salary breakdown?    → SELECT bucket, job_count FROM mv_salary_distribution ORDER BY bucket_order;
  Q: Jobs with Python?    → SELECT * FROM search_jobs_by_keywords(ARRAY['Python'], 20, false);
  Q: Overview stats?      → SELECT * FROM analytics_overview();

---

---

TABLE: scraped_jobs
PURPOSE: Per-user job records. One row per (user_id, external_id) pair.
         Use for user-specific queries (saved count, user's visible jobs).
         DO NOT use for global statistics — use job_analysis_cache instead.

COLUMNS:
  id               BIGINT          -- internal row id (not the job id)
  user_id          UUID            -- the authenticated user's ID
  source           TEXT            -- 'LinkedIn' | 'MathWorks' | 'GitHub' | 'Jobright' | custom string
  external_id      TEXT            -- platform job id (e.g. LinkedIn numeric id)
  title            TEXT            -- job title
  company          TEXT            -- company name
  location         TEXT            -- free-form location string, e.g. 'San Francisco, CA'
  url              TEXT            -- direct job URL
  posted_at        TIMESTAMPTZ     -- when the job was posted (may be NULL)
  visible          BOOLEAN         -- false = dismissed by user
  salary           TEXT            -- extracted salary string or NULL
  visa             TEXT            -- visa sponsorship string or NULL
  work_model       TEXT            -- 'Remote' | 'Hybrid' | 'On-site' | NULL
  analysis         JSONB           -- AI analysis object (see JSONB ACCESS below)
  analysis_status  TEXT            -- 'completed' | 'unavailable' | NULL
  created_at       TIMESTAMPTZ     -- when this row was first inserted
  expires_at       TIMESTAMPTZ     -- TTL expiry (NULL = never expires)

---

TABLE: job_analysis_cache
PURPOSE: Global cache of AI-analyzed jobs, one row per external_id across ALL users.
         Richest data source. Use for: salary distributions, skill frequency,
         company counts, visa stats, work model breakdown, any aggregate analysis.
         Does NOT contain user_id — it is shared across all users.

COLUMNS:
  external_id      TEXT            -- platform job id (unique, primary key)
  job_url          TEXT            -- direct job URL
  analysis         JSONB           -- AI analysis object (see JSONB ACCESS below)
  analysis_status  TEXT            -- 'completed' | 'unavailable' | 'pending'
  salary           TEXT            -- extracted salary string or NULL
  visa             TEXT            -- visa sponsorship string or NULL
  analyzed_at      TIMESTAMPTZ     -- when DeepSeek analysis was written

---

TABLE: custom_sources
PURPOSE: User-configured job scraping sources (company career pages, ATS boards).

COLUMNS:
  id               UUID
  user_id          UUID
  name             TEXT            -- display name, e.g. 'Stripe Jobs'
  icon             TEXT            -- emoji icon
  url              TEXT            -- source URL
  ttl_hours        INT             -- how long custom jobs persist
  interval_minutes INT             -- scrape interval
  ats_type         TEXT            -- 'greenhouse' | 'other' | NULL
  department       TEXT            -- optional department filter for Greenhouse
  status           TEXT            -- 'active' | 'error' | 'scraping'
  last_scraped_at  TIMESTAMPTZ

---

TABLE: custom_source_jobs
PURPOSE: Jobs found from custom sources. Per-user, not in scraped_jobs.

COLUMNS:
  id               UUID
  user_id          UUID
  source_id        UUID            -- FK to custom_sources.id
  external_id      TEXT
  title            TEXT
  company          TEXT
  location         TEXT
  url              TEXT
  source_name      TEXT            -- denormalized name from custom_sources
  posted_at        TIMESTAMPTZ
  visible          BOOLEAN
  created_at       TIMESTAMPTZ

---

TABLE: saved_jobs
PURPOSE: User's saved/bookmarked jobs.

COLUMNS:
  user_id          UUID
  external_id      TEXT
  created_at       TIMESTAMPTZ

---

TABLE: job_analysis_queue
PURPOSE: Queue for pending AI analysis jobs. Status tracking only.

COLUMNS:
  external_id      TEXT
  job_url          TEXT
  status           TEXT            -- 'pending' | 'processing' | 'completed' | 'failed'
  retry_count      INT
  max_retries      INT

---

=== JSONB ACCESS PATTERNS ===

The `analysis` column in scraped_jobs and job_analysis_cache is a JSONB object
with this structure:
{
  "must_have_keywords":    ["Python", "AWS", "Docker"],
  "good_to_have_keywords": ["Kubernetes", "Terraform"],
  "minimum_qualifications":["5+ years experience", "BS in CS"],
  "summary":               "Senior ML Engineer role at...",
  "compensation":          "$150,000 - $200,000",
  "visa_status":           "Sponsorship available"
}

CRITICAL JSONB RULES — violating these produces SQL errors:
  1. Access a text field:      analysis->>'summary'
     (Use ->> for text output, not ->)
  2. Access an array:          analysis->'must_have_keywords'
     (Use -> for JSON output when passing to jsonb functions)
  3. Check if array contains a value:
     analysis->'must_have_keywords' ? 'Python'
  4. Count array elements:
     jsonb_array_length(analysis->'must_have_keywords')
  5. Expand array to rows:
     jsonb_array_elements_text(analysis->'must_have_keywords') AS keyword
  6. Filter rows where keyword appears in either array:
     (analysis->'must_have_keywords' ? 'Python'
      OR analysis->'good_to_have_keywords' ? 'Python')
  7. NEVER use analysis->>'must_have_keywords' to get an array — that returns
     a text representation, not an array you can query into.
  8. For case-insensitive keyword search across both arrays:
     EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(
         COALESCE(analysis->'must_have_keywords', '[]'::jsonb) ||
         COALESCE(analysis->'good_to_have_keywords', '[]'::jsonb)
       ) AS kw
       WHERE lower(kw) = lower('python')
     )

---

=== TABLE ROUTING RULES ===

  Q: Count jobs by company globally           → job_analysis_cache (no user_id filter needed)
  Q: How many jobs does the user have?        → scraped_jobs WHERE user_id = :uid
  Q: Top skills across all analyzed jobs      → job_analysis_cache (expand JSONB arrays)
  Q: User's saved jobs                        → saved_jobs JOIN scraped_jobs
  Q: Jobs from custom sources                 → custom_source_jobs WHERE user_id = :uid
  Q: Visa sponsorship breakdown               → job_analysis_cache WHERE visa IS NOT NULL
  Q: Work model distribution                  → scraped_jobs WHERE user_id = :uid (has work_model)
  Q: Salary range for a title/skill           → job_analysis_cache WHERE salary IS NOT NULL
  Q: Jobs posted in last 24 hours             → scraped_jobs WHERE created_at > NOW() - INTERVAL '24 hours'
  Q: Analysis queue depth                     → job_analysis_queue WHERE status = 'pending'

---

=== DATE ARITHMETIC ===

  Last 24 hours:   created_at > NOW() - INTERVAL '24 hours'
  Last 7 days:     created_at > NOW() - INTERVAL '7 days'
  Last 30 days:    created_at > NOW() - INTERVAL '30 days'
  This week:       DATE_TRUNC('week', created_at) = DATE_TRUNC('week', NOW())
  Today:           DATE_TRUNC('day', created_at) = DATE_TRUNC('day', NOW())

  NEVER use Python datetime formatting in SQL. Always use PostgreSQL interval syntax.

---

=== DEDUPLICATION RULES ===

  - scraped_jobs has one row PER USER per job. For global totals, this means
    the same LinkedIn job ID can appear N times (once per user who saw it).
  - To count unique jobs globally: SELECT COUNT(DISTINCT external_id) FROM scraped_jobs
  - To count analyzed jobs globally: SELECT COUNT(*) FROM job_analysis_cache
    WHERE analysis_status = 'completed'
  - To join user jobs with their analysis:
    SELECT sj.*, jac.analysis FROM scraped_jobs sj
    LEFT JOIN job_analysis_cache jac ON sj.external_id = jac.external_id
    WHERE sj.user_id = :uid

---

=== FORBIDDEN OPERATIONS ===

  NEVER query these tables (contain PII):
    user_resumes, resume_analysis, resume_analysis_queue,
    user_settings, auth.users

  NEVER:
    - Use DELETE or UPDATE or INSERT
    - Reference columns that do not exist in the schema above
    - Use subqueries that reference non-existent tables
    - Return raw user emails or PII fields

---

=== GROUNDING EXAMPLES ===

Q: How many jobs are currently in the queue?
A: SELECT COUNT(*) AS pending_count FROM job_analysis_queue WHERE status = 'pending';

Q: What are the top 10 most required skills across all analyzed jobs?
A: SELECT kw AS skill, COUNT(*) AS frequency
   FROM job_analysis_cache,
        jsonb_array_elements_text(analysis->'must_have_keywords') AS kw
   WHERE analysis_status = 'completed'
     AND analysis IS NOT NULL
   GROUP BY kw
   ORDER BY frequency DESC
   LIMIT 10;

Q: How many remote jobs are available for the current user?
A: SELECT COUNT(*) AS remote_count
   FROM scraped_jobs
   WHERE user_id = :user_id
     AND visible = TRUE
     AND LOWER(work_model) = 'remote';

Q: Show salary distribution by work model (remote vs hybrid vs on-site).
A: SELECT
     work_model,
     COUNT(*) AS job_count,
     COUNT(salary) AS with_salary
   FROM scraped_jobs
   WHERE visible = TRUE
     AND work_model IS NOT NULL
   GROUP BY work_model
   ORDER BY job_count DESC;

Q: Which companies are sponsoring the most visas?
A: SELECT
     -- Note: company is not in job_analysis_cache, so join back to scraped_jobs
     sj.company,
     COUNT(DISTINCT jac.external_id) AS sponsored_jobs
   FROM job_analysis_cache jac
   JOIN scraped_jobs sj ON sj.external_id = jac.external_id
   WHERE jac.visa IS NOT NULL
     AND LOWER(jac.visa) NOT LIKE '%not eligible%'
     AND LOWER(jac.visa) NOT LIKE '%no sponsorship%'
   GROUP BY sj.company
   ORDER BY sponsored_jobs DESC
   LIMIT 10;

Q: How many jobs mention Python in their required skills?
A: SELECT COUNT(*) AS python_jobs
   FROM job_analysis_cache
   WHERE analysis_status = 'completed'
     AND analysis->'must_have_keywords' ? 'Python';

Q: What percentage of jobs analyzed today offer visa sponsorship?
A: SELECT
     ROUND(
       100.0 * COUNT(*) FILTER (
         WHERE visa IS NOT NULL
           AND LOWER(visa) NOT LIKE '%not eligible%'
       ) / NULLIF(COUNT(*), 0),
       1
     ) AS sponsorship_pct
   FROM job_analysis_cache
   WHERE analyzed_at > NOW() - INTERVAL '24 hours'
     AND analysis_status = 'completed';

Q: Show me job postings per source for the current user.
A: SELECT source, COUNT(*) AS job_count
   FROM scraped_jobs
   WHERE user_id = :user_id
     AND visible = TRUE
   GROUP BY source
   ORDER BY job_count DESC;
"""


def get_schema_context() -> str:
    """Return the complete schema context string."""
    return SCHEMA_CONTEXT


def get_compact_schema_context() -> str:
    """
    Condensed schema context for use in the classifier prompt where token
    budget is tight. Omits grounding examples and verbose column descriptions.
    """
    return """
Tables available (PostgreSQL/Supabase):
- scraped_jobs(id, user_id, source, external_id, title, company, location, url, posted_at, visible, salary, visa, analysis JSONB, analysis_status, created_at)
- job_analysis_cache(external_id, job_url, analysis JSONB, analysis_status, salary, visa, analyzed_at, embedding vector(1536)) -- global, no user_id
- custom_sources(id, user_id, name, url, ats_type, department, status, last_scraped_at)
- custom_source_jobs(id, user_id, source_id, title, company, location, url, source_name, posted_at, visible, created_at)
- saved_jobs(user_id, external_id, saved_at)
- job_analysis_queue(external_id, status, retry_count, max_retries)

MATERIALIZED VIEWS (use these first — faster, pre-filtered):
- mv_skill_frequency(skill, skill_type, job_count)
- mv_company_hiring_stats(company, total_jobs, visa_mention_pct, salary_mention_pct, jobs_last_30d)
- mv_salary_distribution(bucket, bucket_order, job_count, avg_salary_low)

RPC FUNCTIONS (SELECT * FROM func()):
- analytics_overview(), analytics_tech_skills(), analytics_good_to_have()
- analytics_top_companies(), analytics_locations(), analytics_visa()
- analytics_salary_strings(), analytics_qualifications(), analytics_timeline(p_days, p_source)
- analytics_sources(), analytics_weekday(), analytics_skill_cooccurrence()
- analytics_queue_health()
- search_jobs_by_keywords(keywords TEXT[], match_count INT, require_all BOOL)
- get_job_detail(p_external_id TEXT)

analysis JSONB structure: {must_have_keywords: [], good_to_have_keywords: [], minimum_qualifications: [], summary: "", compensation: "", visa_status: ""}
JSONB array contains: analysis->'must_have_keywords' ? 'Python'
JSONB text field: analysis->>'summary'
Expand to rows: jsonb_array_elements_text(analysis->'must_have_keywords')

FORBIDDEN TABLES: user_resumes, resume_analysis, resume_analysis_queue, user_settings, user_configs, auth.users, ai_kb_sessions, ai_kb_messages
FORBIDDEN OPERATIONS: DELETE, UPDATE, INSERT, DROP, CREATE, ALTER, GRANT, REVOKE
"""
