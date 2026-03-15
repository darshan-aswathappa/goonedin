"""
NL2SQL schema context string for the GoOneIn knowledge base.

Two-layer approach:
  1. DYNAMIC (preferred): Live schema fetched from information_schema at startup.
     Exact column names, data types — impossible for the LLM to hallucinate columns.
  2. STATIC (fallback): Hand-written schema used only when DB is unreachable at startup.

The instructional content (JSONB patterns, routing rules, grounding examples) is always
static — it teaches the LLM *how* to query, not *what* exists.
"""

from app.services.knowledge_base.schema_introspection import (
    get_live_schema,
    get_live_compact_schema,
)

# ---------------------------------------------------------------------------
# STATIC FALLBACK — used only when live introspection fails
# ---------------------------------------------------------------------------

STATIC_TABLE_SCHEMA = """
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
  visible          BOOLEAN         -- false = dismissed by user (DO NOT filter on this column — show all jobs regardless)
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
         Use for: salary distributions, skill frequency, visa stats, aggregate analysis.
         Does NOT contain user_id — it is shared across all users.
         WARNING: Does NOT have company, location, title, source, or work_model columns!
         To filter/group by those, JOIN with scraped_jobs on external_id.
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
"""

STATIC_COMPACT_SCHEMA = """Tables available (PostgreSQL/Supabase) — ONLY use columns listed here:
- scraped_jobs(id BIGINT, user_id UUID, source TEXT, external_id TEXT, title TEXT, company TEXT, location TEXT, url TEXT, posted_at TIMESTAMPTZ, visible BOOLEAN, salary TEXT, visa TEXT, work_model TEXT, analysis JSONB, analysis_status TEXT, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)
- job_analysis_cache(external_id TEXT, job_url TEXT, analysis JSONB, analysis_status TEXT, salary TEXT, visa TEXT, analyzed_at TIMESTAMPTZ, embedding VECTOR) -- global, no user_id. NO company/location/title columns! JOIN scraped_jobs for those.
- custom_sources(id UUID, user_id UUID, name TEXT, icon TEXT, url TEXT, ttl_hours INT, interval_minutes INT, ats_type TEXT, department TEXT, status TEXT, last_scraped_at TIMESTAMPTZ)
- custom_source_jobs(id UUID, user_id UUID, source_id UUID, external_id TEXT, title TEXT, company TEXT, location TEXT, url TEXT, source_name TEXT, posted_at TIMESTAMPTZ, visible BOOLEAN, created_at TIMESTAMPTZ)
- saved_jobs(user_id UUID, external_id TEXT, created_at TIMESTAMPTZ)
- job_analysis_queue(external_id TEXT, job_url TEXT, status TEXT, retry_count INT, max_retries INT)

Materialized views (use these first — faster, pre-filtered):
- mv_skill_frequency(skill TEXT, skill_type TEXT, job_count BIGINT)
- mv_company_hiring_stats(company TEXT, total_jobs BIGINT, source_count BIGINT, sources TEXT[], location_count BIGINT, locations TEXT[], visa_mention_pct NUMERIC, salary_mention_pct NUMERIC, first_seen_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ, jobs_last_30d BIGINT)
- mv_salary_distribution(bucket TEXT, bucket_order INT, job_count BIGINT, avg_salary_low NUMERIC, min_salary INT, max_salary INT, sample_raw_salaries TEXT[])"""


# ---------------------------------------------------------------------------
# INSTRUCTIONAL CONTENT — always static (teaches how to query)
# ---------------------------------------------------------------------------

RPC_FUNCTIONS = """
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
  Q: Top skills?          → SELECT skill, job_count FROM mv_skill_frequency WHERE skill_type = 'must_have' ORDER BY job_count DESC LIMIT 20;
  Q: Companies hiring?    → SELECT company, total_jobs, jobs_last_30d FROM mv_company_hiring_stats ORDER BY total_jobs DESC LIMIT 20;
  Q: Salary breakdown?    → SELECT bucket, job_count FROM mv_salary_distribution ORDER BY bucket_order;
  Q: Jobs with Python?    → SELECT * FROM search_jobs_by_keywords(ARRAY['Python'], 20, false);
  Q: Overview stats?      → SELECT * FROM analytics_overview();
  Q: Python vs Java?      → SELECT skill, job_count FROM mv_skill_frequency WHERE skill_type = 'must_have' AND skill IN ('python', 'java') ORDER BY job_count DESC;
"""

JSONB_PATTERNS = """
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
  8. ALWAYS use case-insensitive matching when comparing keywords:
     WRONG:  kw IN ('Python', 'Java')     — misses 'python', 'PYTHON'
     RIGHT:  LOWER(kw) IN ('python', 'java')
     RIGHT on MV: LOWER(skill) IN ('python', 'java')
  9. For case-insensitive keyword search across both arrays:
     EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(
         COALESCE(analysis->'must_have_keywords', '[]'::jsonb) ||
         COALESCE(analysis->'good_to_have_keywords', '[]'::jsonb)
       ) AS kw
       WHERE lower(kw) = lower('python')
     )
"""

TABLE_ROUTING_RULES = """
=== TABLE ROUTING RULES ===

  Q: Count jobs by company globally           → mv_company_hiring_stats or job_analysis_cache JOIN scraped_jobs
  Q: How many jobs does the user have?        → scraped_jobs WHERE user_id = :uid
  Q: Top skills across all analyzed jobs      → job_analysis_cache (expand JSONB arrays)
  Q: User's saved jobs                        → saved_jobs JOIN scraped_jobs
  Q: Jobs from custom sources                 → custom_source_jobs WHERE user_id = :uid
  Q: Visa sponsorship breakdown               → job_analysis_cache WHERE visa IS NOT NULL
  Q: Work model distribution                  → scraped_jobs WHERE user_id = :uid (has work_model)
  Q: Salary range for a title/skill           → job_analysis_cache WHERE salary IS NOT NULL
  Q: Jobs posted in last 24 hours             → scraped_jobs WHERE created_at > NOW() - INTERVAL '24 hours'
  Q: Analysis queue depth                     → job_analysis_queue WHERE status = 'pending'
  Q: Company X in which locations?            → scraped_jobs JOIN job_analysis_cache (company/location are on scraped_jobs)
"""

DATE_ARITHMETIC = """
=== DATE ARITHMETIC ===

  Last 24 hours:   created_at > NOW() - INTERVAL '24 hours'
  Last 7 days:     created_at > NOW() - INTERVAL '7 days'
  Last 30 days:    created_at > NOW() - INTERVAL '30 days'
  This week:       DATE_TRUNC('week', created_at) = DATE_TRUNC('week', NOW())
  Today:           DATE_TRUNC('day', created_at) = DATE_TRUNC('day', NOW())

  NEVER use Python datetime formatting in SQL. Always use PostgreSQL interval syntax.
"""

DEDUPLICATION_RULES = """
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
"""

FORBIDDEN_OPERATIONS = """
=== FORBIDDEN OPERATIONS ===

  NEVER query these tables (contain PII):
    user_resumes, resume_analysis, resume_analysis_queue,
    user_settings, auth.users

  NEVER:
    - Use DELETE or UPDATE or INSERT
    - Reference columns that do not exist in the schema above
    - Use subqueries that reference non-existent tables
    - Return raw user emails or PII fields
"""

GROUNDING_EXAMPLES = """
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
     AND LOWER(work_model) = 'remote';

Q: Show salary distribution by work model (remote vs hybrid vs on-site).
A: SELECT
     work_model,
     COUNT(*) AS job_count,
     COUNT(salary) AS with_salary
   FROM scraped_jobs
   WHERE work_model IS NOT NULL
   GROUP BY work_model
   ORDER BY job_count DESC;

Q: Which companies are sponsoring the most visas?
A: SELECT
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

Q: In which locations does Google post the most jobs?
A: SELECT sj.location, COUNT(*) AS job_count
   FROM job_analysis_cache jac
   JOIN scraped_jobs sj ON sj.external_id = jac.external_id
   WHERE jac.analysis_status = 'completed'
     AND sj.company ILIKE '%google%'
     AND sj.location IS NOT NULL
   GROUP BY sj.location
   ORDER BY job_count DESC
   LIMIT 10;

Q: How many jobs does Apple have?
A: SELECT company, total_jobs, jobs_last_30d
   FROM mv_company_hiring_stats
   WHERE LOWER(company) LIKE '%apple%'
   ORDER BY total_jobs DESC;

Q: Python vs Java — which skill appears more in job descriptions?
A: SELECT skill, job_count
   FROM mv_skill_frequency
   WHERE skill_type = 'must_have'
     AND skill IN ('python', 'java')
   ORDER BY job_count DESC;

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
   GROUP BY source
   ORDER BY job_count DESC;
"""


# ---------------------------------------------------------------------------
# Compact instructional content for classifier
# ---------------------------------------------------------------------------

COMPACT_INSTRUCTIONS = """
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

CRITICAL TABLE ROUTING:
- job_analysis_cache has NO company, location, or title columns. To filter/group by company or location, JOIN with scraped_jobs.
- For company stats, prefer mv_company_hiring_stats (has company, total_jobs, locations[], visa_mention_pct).
- For location of a specific company's jobs: JOIN job_analysis_cache + scraped_jobs ON external_id.
- ONLY use columns that appear in the schema above. If a column is not listed, it does not exist.

FORBIDDEN TABLES: user_resumes, resume_analysis, resume_analysis_queue, user_settings, user_configs, auth.users, ai_kb_sessions, ai_kb_messages
FORBIDDEN OPERATIONS: DELETE, UPDATE, INSERT, DROP, CREATE, ALTER, GRANT, REVOKE
"""


# ---------------------------------------------------------------------------
# Public API — used by prompts.py
# ---------------------------------------------------------------------------

def get_schema_context() -> str:
    """
    Return the full schema context string for the SQL corrector prompt.
    Uses live DB schema if available, otherwise falls back to static.
    """
    live = get_live_schema()
    table_schema = live if live else STATIC_TABLE_SCHEMA

    return f"""
=== DATABASE SCHEMA CONTEXT ===

You are querying a PostgreSQL database (via Supabase). Follow every rule below exactly.
IMPORTANT: ONLY use columns that are listed in the schema below. If a column is not listed for a table, it DOES NOT EXIST.

=== EXACT TABLE SCHEMA (from live database introspection) ===

{table_schema}

---

{RPC_FUNCTIONS}

---

{JSONB_PATTERNS}

---

{TABLE_ROUTING_RULES}

---

{DATE_ARITHMETIC}

---

{DEDUPLICATION_RULES}

---

{FORBIDDEN_OPERATIONS}

---

{GROUNDING_EXAMPLES}
"""


def get_compact_schema_context() -> str:
    """
    Condensed schema context for the classifier prompt.
    Uses live DB schema if available, otherwise falls back to static.
    """
    live_compact = get_live_compact_schema()
    table_schema = live_compact if live_compact else STATIC_COMPACT_SCHEMA

    return f"""
{table_schema}

{COMPACT_INSTRUCTIONS}
"""
