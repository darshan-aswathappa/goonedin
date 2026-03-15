# AI Knowledge Base — Implementation Plan

## Overview

A genuinely intelligent, unbounded AI knowledge base embedded in the GoOneIn analytics dashboard. Users can ask anything about the job market in natural language. The AI writes its own SQL queries, executes them against real data, runs semantic vector search when needed, and synthesizes terse Bloomberg-terminal-style answers.

**Invocation:** Navigate to `/analytics` → full-page AI chatbox. Press `/` on the analytics page → Spotlight command palette for quick navigation. Spotlight is scoped to the analytics page only — not present on the jobsboard or other pages.

---

## Architecture

```
User Question
     │
     ▼
[1] classify_and_plan()          ← DeepSeek, temperature=0, returns QueryPlan JSON
     │   strategy: sql_only | vector_only | hybrid | chitchat
     │
     ├── sql_only / hybrid ─────────────────────────────────┐
     │                                                       │
     ▼                                                       │
[2a] execute_ai_query(sql)        ← asyncpg, read-only role │
     │   PostgresError? → _self_correct_sql() → retry once  │
     │                                                       │
     ├── vector_only / hybrid ──────────────────────────────┘
     │
     ▼
[2b] vector_search(query)         ← OpenAI embed → pgvector <=> cosine
     │
     ▼
[3] synthesize_answer()           ← DeepSeek streaming, temperature=0.3
     │   Bloomberg voice: terse, lead with numbers, no filler
     ▼
[4] persist turn to session store (in-process, 20-turn rolling window, 1h TTL)
```

**Why NL2SQL over predefined tools:** SQL is a complete language — any question answerable from the data, SQL can express. New questions tomorrow require zero new code. The LLM writes the query on the fly.

**Why pgvector alongside:** SQL answers statistical/structural questions. pgvector answers semantic/similarity questions ("find jobs about distributed systems", "roles like startup culture"). Together they cover 100% of use cases.

---

## 1. Database Layer

### 1.1 Migrations (run in Supabase SQL Editor)

```sql
-- ============================================================
-- MIGRATION 1: Enable pgvector and add embedding column
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE job_analysis_cache
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_generated_at TIMESTAMPTZ;

-- HNSW index — better than IVFFlat for growing datasets
-- IVFFlat needs re-indexing as data grows; HNSW is incremental, 98% recall at any scale
-- m=16, ef_construction=64 are the documented starting parameters for general use
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jac_embedding_hnsw
  ON job_analysis_cache
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- MIGRATION 2: Performance indexes for AI-generated queries
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

-- ============================================================
-- MIGRATION 3: Read-only role for AI SQL execution
-- ============================================================

-- Create role (no login — Python connects as service_role and SET ROLE)
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
ALTER ROLE ai_kb_reader BYPASSRLS;

-- Create login user for AI_READONLY_DB_URL connection
CREATE USER ai_query_user WITH PASSWORD 'your-strong-password';
GRANT ai_kb_reader TO ai_query_user;

-- ============================================================
-- MIGRATION 4: Materialized views for expensive aggregations
-- (JSONB unnest on 100K rows = 500ms-2s per query; MV pre-computes it)
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_skill_frequency AS
SELECT
  LOWER(skill) AS skill,
  skill_type,
  COUNT(*)                                                      AS total_count,
  COUNT(*) FILTER (WHERE analyzed_at > NOW() - INTERVAL '7 days')   AS count_7d,
  COUNT(*) FILTER (WHERE analyzed_at > NOW() - INTERVAL '30 days')  AS count_30d,
  MIN(analyzed_at)                                              AS first_seen,
  MAX(analyzed_at)                                              AS last_seen
FROM job_analysis_cache,
  LATERAL (
    SELECT value AS skill, 'must_have' AS skill_type
    FROM jsonb_array_elements_text(
      CASE WHEN analysis ? 'must_have_keywords' THEN analysis->'must_have_keywords' ELSE '[]'::jsonb END
    )
    UNION ALL
    SELECT value AS skill, 'nice_to_have' AS skill_type
    FROM jsonb_array_elements_text(
      CASE WHEN analysis ? 'good_to_have_keywords' THEN analysis->'good_to_have_keywords' ELSE '[]'::jsonb END
    )
  ) skills
WHERE analysis IS NOT NULL AND skill <> ''
GROUP BY LOWER(skill), skill_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_skill_freq_pk
  ON mv_skill_frequency (skill, skill_type);

-- -------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_company_hiring_stats AS
SELECT
  company,
  COUNT(*)                                                        AS total_jobs,
  COUNT(*) FILTER (WHERE posted_at > NOW() - INTERVAL '7 days')  AS jobs_7d,
  COUNT(*) FILTER (WHERE posted_at > NOW() - INTERVAL '30 days') AS jobs_30d,
  COUNT(DISTINCT location)                                        AS location_count,
  COUNT(*) FILTER (WHERE work_model ILIKE '%remote%')            AS remote_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE work_model ILIKE '%remote%') / COUNT(*), 1
  ) AS remote_pct
FROM scraped_jobs
WHERE company IS NOT NULL AND company <> ''
  AND visible = TRUE
GROUP BY company;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_company_stats_pk
  ON mv_company_hiring_stats (company);
CREATE INDEX IF NOT EXISTS idx_mv_company_stats_total
  ON mv_company_hiring_stats (total_jobs DESC);

-- -------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_salary_distribution AS
SELECT
  bucket,
  bucket_order,
  COUNT(*) AS job_count
FROM (
  SELECT
    external_id,
    CASE
      WHEN midpoint < 60000  THEN '<$60K'
      WHEN midpoint < 80000  THEN '$60-80K'
      WHEN midpoint < 100000 THEN '$80-100K'
      WHEN midpoint < 130000 THEN '$100-130K'
      WHEN midpoint < 160000 THEN '$130-160K'
      WHEN midpoint < 200000 THEN '$160-200K'
      ELSE '>$200K'
    END AS bucket,
    CASE
      WHEN midpoint < 60000  THEN 1
      WHEN midpoint < 80000  THEN 2
      WHEN midpoint < 100000 THEN 3
      WHEN midpoint < 130000 THEN 4
      WHEN midpoint < 160000 THEN 5
      WHEN midpoint < 200000 THEN 6
      ELSE 7
    END AS bucket_order
  FROM (
    SELECT
      external_id,
      (
        REGEXP_REPLACE(
          SPLIT_PART(COALESCE(salary, analysis->>'compensation', ''), '-', 1),
          '[^0-9]', '', 'g'
        )::NUMERIC +
        REGEXP_REPLACE(
          SPLIT_PART(COALESCE(salary, analysis->>'compensation', ''), '-', 2),
          '[^0-9]', '', 'g'
        )::NUMERIC
      ) / 2 AS midpoint
    FROM job_analysis_cache
    WHERE (salary IS NOT NULL OR analysis ? 'compensation')
      AND COALESCE(salary, analysis->>'compensation', '') ~ '\$?[0-9]'
  ) parsed
  WHERE midpoint > 0
) bucketed
GROUP BY bucket, bucket_order
ORDER BY bucket_order;

-- -------------------------------------------------------

-- Refresh function (called by background worker after analysis batch)
CREATE OR REPLACE FUNCTION refresh_ai_kb_views()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  t0 TIMESTAMPTZ;
  skill_ms FLOAT;
  company_ms FLOAT;
  salary_ms FLOAT;
BEGIN
  t0 = clock_timestamp();
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_frequency;
  skill_ms = EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000;

  t0 = clock_timestamp();
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_company_hiring_stats;
  company_ms = EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000;

  t0 = clock_timestamp();
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_salary_distribution;
  salary_ms = EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000;

  RETURN json_build_object(
    'refreshed_at', NOW(),
    'mv_skill_frequency_ms', skill_ms,
    'mv_company_hiring_stats_ms', company_ms,
    'mv_salary_distribution_ms', salary_ms
  );
END;
$$;

-- ai_kb_reader cannot trigger refreshes — only backend service role can
REVOKE ALL ON FUNCTION refresh_ai_kb_views() FROM ai_kb_reader;

-- ============================================================
-- MIGRATION 5: Semantic search RPC function
-- ============================================================

CREATE OR REPLACE FUNCTION search_jobs_by_embedding(
  query_embedding   vector(1536),
  match_count       INT     DEFAULT 20,
  similarity_threshold FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  external_id  TEXT,
  job_url      TEXT,
  salary       TEXT,
  visa         TEXT,
  summary      TEXT,
  must_have    JSONB,
  similarity   FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    jac.external_id,
    jac.job_url,
    jac.salary,
    jac.visa,
    jac.analysis->>'summary'            AS summary,
    jac.analysis->'must_have_keywords'  AS must_have,
    (1 - (jac.embedding <=> query_embedding))::FLOAT AS similarity
  FROM job_analysis_cache jac
  WHERE jac.embedding IS NOT NULL
    AND jac.analysis_status = 'completed'
    AND (1 - (jac.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY jac.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION search_jobs_by_embedding TO ai_kb_reader;

-- ============================================================
-- MIGRATION 6: Conversation history tables
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_kb_sessions (
  session_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_active  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '90 days')
);
CREATE INDEX IF NOT EXISTS idx_ai_kb_sessions_user   ON ai_kb_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_kb_sessions_expiry ON ai_kb_sessions (expires_at);

CREATE TABLE IF NOT EXISTS ai_kb_messages (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID         NOT NULL REFERENCES ai_kb_sessions(session_id) ON DELETE CASCADE,
  turn_index    INT          NOT NULL,           -- monotonic, no tie-breaking needed
  role          TEXT         NOT NULL CHECK (role IN ('user','assistant')),
  content       TEXT         NOT NULL,
  query_plan    JSONB,                           -- serialised QueryPlan (strategy, sql, rows)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_kb_msg_session ON ai_kb_messages (session_id, turn_index);

-- TTL cleanup (can be scheduled via pg_cron: '0 3 * * *')
CREATE OR REPLACE FUNCTION cleanup_expired_ai_kb_sessions()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE deleted INT;
BEGIN
  DELETE FROM ai_kb_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- RLS: users can only read their own sessions
ALTER TABLE ai_kb_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_kb_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_kb_sessions_owner ON ai_kb_sessions
  USING (user_id = auth.uid());
CREATE POLICY ai_kb_messages_owner ON ai_kb_messages
  USING (session_id IN (
    SELECT session_id FROM ai_kb_sessions WHERE user_id = auth.uid()
  ));

-- ai_kb_reader cannot read conversation history (it only queries job data)
REVOKE ALL ON ai_kb_sessions FROM ai_kb_reader;
REVOKE ALL ON ai_kb_messages FROM ai_kb_reader;
```

### 1.2 Schema Context (NL2SQL Grounding)

The schema context string is the most important piece — it determines 70% of AI accuracy. Must include:

- Exact annotated `CREATE TABLE` DDL for all safe tables
- JSONB access pattern reference (8 rules — where LLMs fail most on PostgreSQL):
  - `analysis->>'field'` returns text; `analysis->'field'` returns JSONB
  - Array contains: `analysis->'must_have_keywords' ? 'Python'`
  - Case-insensitive: `EXISTS (SELECT 1 FROM jsonb_array_elements_text(analysis->'must_have_keywords') k WHERE k ILIKE '%python%')`
  - Expand to rows: `jsonb_array_elements_text(analysis->'must_have_keywords')`
- Table routing rules (when to use `job_analysis_cache` vs `scraped_jobs`)
- Deduplication rules (`scraped_jobs` has N rows per job — one per user; use `COUNT(DISTINCT external_id)` or `job_analysis_cache` for global stats)
- Date arithmetic (`NOW() - INTERVAL '7 days'`, never Python-style)
- Forbidden tables (user_resumes, resume_analysis, user_settings, auth.\*)
- 8 grounding Q&A examples covering the most common query patterns

---

## 2. Backend Layer

### 2.1 New Environment Variables

Add to `backend/.env` and `backend/app/core/config.py` Pydantic Settings:

```bash
OPENAI_API_KEY=sk-...              # text-embedding-3-small (DeepSeek has no embeddings API)
AI_READONLY_DB_URL=postgresql+asyncpg://ai_query_user:password@host:5432/postgres
KB_SQL_ROW_LIMIT=500               # hard cap on AI query results (default: 500)
KB_EMBED_CACHE_TTL=3600            # seconds to cache embeddings in-process (default: 3600)
```

### 2.2 New Files

```
backend/app/
├── models/
│   └── knowledge_base.py            NEW — Pydantic models
├── services/
│   ├── knowledge_base/
│   │   ├── __init__.py
│   │   ├── schema_context.py        NEW — annotated DDL + JSONB rules + Q&A examples
│   │   ├── prompts.py               NEW — classifier, corrector, synthesizer prompts
│   │   ├── sql_executor.py          NEW — asyncpg pool, safety layers, execute_ai_query()
│   │   └── conversation_memory.py   NEW — in-process session store, rolling 20-turn window
│   ├── knowledge_base_service.py    NEW — embed_text(), vector_search(), backfill_embeddings()
│   └── ai_orchestrator.py           NEW — classify_and_plan(), execute_plan(), synthesize_answer()
└── api/
    └── knowledge_base.py            NEW — SSE router, 3 endpoints
```

**Modified:**

- `backend/app/services/job_queue.py` — add `embed_job_on_write()` call in `write_analysis_to_cache()` (non-fatal, lazy import, guarded by `OPENAI_API_KEY`)
- `backend/app/core/config.py` — add 4 new env vars
- `backend/app/main.py` — `app.include_router(kb_router)` + `backfill_embeddings()` on startup + `close_pool()` on shutdown

### 2.3 `models/knowledge_base.py`

```python
from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional, Any

class SSEEventType(str, Enum):
    STATUS = "status"
    CHUNK  = "chunk"
    DONE   = "done"
    ERROR  = "error"

class SSEEvent(BaseModel):
    type: SSEEventType
    message: Optional[str]  = None   # for STATUS
    text:    Optional[str]  = None   # for CHUNK
    session_id:    Optional[str]  = None   # for DONE
    rows_returned: Optional[int]  = None   # for DONE
    query_plan:    Optional[dict] = None   # for DONE
    error:         Optional[str]  = None   # for ERROR

    model_config = {"populate_by_name": True}
    def sse_line(self) -> str:
        return f"data: {self.model_dump_json(exclude_none=True)}\n\n"

class QueryStrategy(str, Enum):
    SQL_ONLY    = "sql_only"
    VECTOR_ONLY = "vector_only"
    HYBRID      = "hybrid"
    CHITCHAT    = "chitchat"

class QueryPlan(BaseModel):
    strategy:     QueryStrategy
    sql:          Optional[str] = None
    vector_query: Optional[str] = None
    rationale:    Optional[str] = None

class KBQueryRequest(BaseModel):
    message:    str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = None
```

### 2.4 `services/knowledge_base/sql_executor.py`

**Four safety layers (in order):**

1. **Length cap** — max 4096 chars
2. **Regex forbidden patterns** — `INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXECUTE|CALL`, inline `--` comments, multiple statements after `;`
3. **sqlglot AST check** — only `Select/Union/With` AST nodes allowed (non-fatal if sqlglot not installed)
4. **PII table blocklist** — explicit check that SQL string does not reference `user_resumes`, `resume_analysis`, `user_settings`, `auth.`

**Execution:**

- asyncpg lazy singleton pool (`min_size=1, max_size=5, command_timeout=15s`)
- Wrap query: `SELECT * FROM (<sql>) _ai_q LIMIT {KB_SQL_ROW_LIMIT}`
- `SET LOCAL statement_timeout = '8000'` — Postgres enforces it at DB level, cannot be bypassed
- Row results serialised: UUID→str, date→isoformat, Decimal→float

**Key functions:** `execute_ai_query(sql) -> list[dict]`, `_validate_sql_safety(sql)`, `close_pool()`

### 2.5 `services/knowledge_base_service.py`

**`embed_text(text) -> list[float] | None`**

- OpenAI `text-embedding-3-small`, 1536 dims
- In-process SHA-256 cache with TTL (`KB_EMBED_CACHE_TTL`)
- `asyncio.to_thread()` wrapper (same pattern as `analyze_job_with_deepseek()`)
- Returns `None` on failure — callers degrade gracefully

**`build_job_embedding_text(record) -> str`**

```
Job title: {title}. {title}.          ← repeated for upweighting
Company: {company}
Location: {location}
Summary: {summary}
Required skills: {must_have_keywords joined}
Preferred skills: {good_to_have_keywords joined}
Salary: {compensation}
Visa: {visa_status}
```

Title repeated twice — embedding distance correlates with token proximity, doubling title increases its weight without arbitrary scaling.

**`vector_search(query, limit=20) -> list[dict]`**

- Embed query → `[f1,f2,...]::vector` literal → asyncpg cosine distance `<=>` ORDER BY
- Falls back to `[]` if pgvector not enabled (`UndefinedFunctionError`)

**`backfill_embeddings(supabase)`**

- Pages through `job_analysis_cache WHERE embedding IS NULL AND analysis_status='completed'`
- Batch size: 50 rows, 1s sleep between pages (OpenAI RPM limit respect)
- Non-fatal per row — one failure doesn't stop the batch
- Fire-and-forget `create_task` on startup

### 2.6 `services/ai_orchestrator.py`

**`classify_and_plan(question, history) -> QueryPlan`**

- DeepSeek, `temperature=0`, `response_format={"type": "json_object"}`
- Compact schema context in prompt (saves tokens — full context for synthesis)
- Returns `QueryPlan`; falls back to `CHITCHAT` on JSON parse error (never crashes)
- Last 6 history turns injected (bounds token use in classifier)

**`execute_plan(plan, question) -> dict`**

```python
results = {}
if plan.strategy in (SQL_ONLY, HYBRID):
    try:
        results["sql_data"] = await execute_ai_query(plan.sql)
    except PostgresError as e:
        fixed_sql = await _self_correct_sql(plan.sql, str(e), question)
        results["sql_data"] = await execute_ai_query(fixed_sql)
        # if this also fails → surfaced as [System note: query failed]

if plan.strategy in (VECTOR_ONLY, HYBRID):
    results["vector_data"] = await vector_search(plan.vector_query)
```

**`synthesize_answer(question, data, history) -> AsyncIterator[str]`**

- Full schema context in system prompt (not compact)
- DeepSeek `stream=True`, `temperature=0.3`, `max_tokens=2048`
- Yields tokens as they arrive
- Bloomberg voice rules in prompt: lead with number, no filler, markdown tables for multi-row, `**N**` bold numbers, "No data found." for empty sets
- Rate-limit backoff: 3 attempts, 2s/4s/8s (same pattern as existing job queue worker)

**`_self_correct_sql(broken_sql, error, question) -> str`**

- Single retry: send broken SQL + exact Postgres error + full schema context to DeepSeek
- Returns corrected SQL or `None` (orchestrator surfaces graceful error to synthesizer)

### 2.7 `api/knowledge_base.py` — SSE Router

**`POST /knowledge-base/query`** — `StreamingResponse(media_type="text/event-stream")`

Headers: `X-Accel-Buffering: no`, `Cache-Control: no-cache`, `Connection: keep-alive`

SSE event sequence:

```
{"type":"status","message":"CLASSIFYING QUERY..."}
{"type":"status","message":"EXECUTING SQL..."}           ← if SQL strategy
{"type":"status","message":"RUNNING SEMANTIC SEARCH..."}  ← if vector strategy
{"type":"status","message":"FOUND 42 RESULTS. SYNTHESISING..."}
{"type":"chunk","text":"Python leads with "}
{"type":"chunk","text":"847 postings..."}
{"type":"done","session_id":"...","rows_returned":42,"query_plan":{...}}
```

Any unhandled exception → `{"type":"error","error":"..."}` instead of TCP disconnect.

**Chitchat fast path:** skips `execute_plan()` entirely → ~600ms latency.

**`GET /knowledge-base/sessions/{session_id}`** — returns conversation history (404 if expired)

**`DELETE /knowledge-base/sessions/{session_id}`** — clear session (204, idempotent)

### 2.8 `services/knowledge_base/conversation_memory.py`

| Property            | Value                 | Rationale                                        |
| ------------------- | --------------------- | ------------------------------------------------ |
| Verbatim turns kept | 20 (rolling window)   | Full history for synthesizer                     |
| Classifier context  | Last 6 turns only     | Token budget                                     |
| Session TTL         | 1h idle               | Typical work session                             |
| Cleanup interval    | 5 min background task | Prevents memory leak                             |
| Storage             | In-process dict       | Single-process; swap to Redis for multi-instance |

Compression at 12 turns: oldest 6 turns → DeepSeek summarizer → stored as `system` message (not user/assistant — avoids conversation attribution confusion).

### 2.9 Embedding Hook in `job_queue.py`

In `write_analysis_to_cache()`, **after** the Supabase upsert succeeds:

```python
# Non-fatal embedding — lazy import avoids circular dependency
try:
    if settings.OPENAI_API_KEY:
        from app.services.knowledge_base_service import build_job_embedding_text, embed_text
        text = build_job_embedding_text(analysis_record)
        vector = await embed_text(text)
        if vector:
            await supabase.table("job_analysis_cache") \
                .update({"embedding": vector, "embedding_generated_at": "now()"}) \
                .eq("external_id", external_id) \
                .execute()
except Exception as e:
    logger.warning(f"Embedding failed for {external_id}: {e}")  # non-fatal
```

Also: call `refresh_ai_kb_views()` RPC after every 50 analyzed jobs (not every single one).

---

## 3. AI Layer — Prompts

### 3.1 Classifier Prompt

- Temperature: 0 (deterministic SQL generation)
- Contains: compact schema, strategy decision table, 5 grounding examples for ambiguous cases
- Output: `{"strategy": "...", "sql": "...", "vector_query": "...", "rationale": "..."}`
- `sql` uses `$1::uuid` placeholder for `user_id` where needed (parameterized, not interpolated)
- Fallback: any JSON parse failure → `QueryPlan(strategy=CHITCHAT)`

### 3.2 SQL Self-Corrector Prompt

- Temperature: 0
- Contains: full schema, table of common Postgres errors → fixes
  - `->` vs `->>` (JSONB type mismatch)
  - `jsonb_array_elements_text` vs `jsonb_array_elements` (text vs JSONB elements)
  - `analysis ? 'key'` (key exists) vs `analysis->>'key' IS NOT NULL`
  - Column doesn't exist → check schema context for correct name
- Output: `{"corrected_sql": "...", "fix_description": "..."}`
- If unfixable: `{"corrected_sql": null}`

### 3.3 Synthesizer Prompt (Bloomberg Voice)

```
You are a job market analyst terminal. Synthesize data into direct, terse answers.

RULES:
- Lead with the number or key fact
- No filler: no "Great question!", no "Based on the data provided..."
- Bold key numbers: **847 postings**, **$142K median**
- Use markdown tables for multi-row comparisons
- Empty data → "No data found for this query."
- Out-of-scope → "INSUFFICIENT DATA — [reason]"
- Max 5 sentences unless elaboration is asked for
- Never mention SQL, database, or internal implementation details
```

---

## 4. Frontend Layer

### 4.1 Architecture Decision: Integrated into Analytics Terminal

The command palette and AI companion live in the **analytics app** (`/analytics/` directory) — the standalone HireFeed Analytics terminal. The jobsboard (`/frontend/`) remains a clean, focused job feed with no AI/spotlight overlay.

- `analytics/src/app/layout.tsx` — `<CommandPaletteProvider>` wraps the entire app + `<AIPanel />` slide-out
- `/` opens command palette from anywhere on the dashboard
- `⌘J` toggles the AI companion slide-out panel (right side, 480px)
- Dashboard retains all charts/panels — AI is an overlay, not a replacement
- TerminalHeader shows keyboard hints: `/ COMMANDS` and `⌘J AI`

### 4.2 Files (all in analytics app — COMPLETE)

```
analytics/src/
├── types/
│   └── knowledge-base.ts           ✅ DONE — ChatMessage, QueryPlan, StreamEvent, Command interfaces
├── hooks/
│   └── useKnowledgeBase.ts         ✅ DONE — streaming SSE hook with AbortController (no auth dep)
├── components/
│   ├── CommandPaletteProvider.tsx  ✅ DONE — "use client", "/" + ⌘K + ⌘J listeners, IME guard
│   ├── CommandPalette.tsx          ✅ DONE — @radix-ui/react-dialog, section nav, AI toggle
│   ├── AICompanion.tsx             ✅ DONE — chat panel, streaming, query badges, suggested prompts
│   └── AIPanel.tsx                 ✅ DONE — slide-out wrapper, backdrop, event-driven toggle
└── app/
    └── layout.tsx                  ✅ DONE — CommandPaletteProvider + AIPanel wrapping entire app
```

**Note:** Frontend files in `frontend/src/` (AICompanion, CommandPalette, etc.) are now legacy — canonical versions live in `analytics/src/`.

### 4.2 `types/knowledge-base.ts`

```typescript
export type QueryStrategy = "sql_only" | "vector_only" | "hybrid" | "chitchat";
export type SSEEventType = "status" | "chunk" | "done" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string; // final content (accumulated from chunks)
  timestamp: Date;
  queryPlan?: QueryPlan; // present on assistant messages after completion
  rowsReturned?: number;
}

export interface QueryPlan {
  strategy: QueryStrategy;
  sql?: string;
  vector_query?: string;
  rationale?: string;
}

export interface StreamEvent {
  type: SSEEventType;
  message?: string; // STATUS
  text?: string; // CHUNK
  session_id?: string; // DONE
  rows_returned?: number; // DONE
  query_plan?: QueryPlan; // DONE
  error?: string; // ERROR
}

export interface Command {
  id: string;
  label: string;
  description?: string;
  group: "navigate" | "action";
  action: () => void;
  keywords?: string[];
}
```

### 4.3 `hooks/useKnowledgeBase.ts`

```typescript
// Returns:
interface UseKnowledgeBase {
  sendMessage: (text: string) => Promise<void>;
  messages: ChatMessage[];
  isStreaming: boolean;
  currentStatus: string | null; // e.g. "EXECUTING SQL..."
  sessionId: string | null;
  setSessionId: (id: string) => void;
  clearSession: () => void;
}
```

**Streaming loop:**

```typescript
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? ""; // keep incomplete line

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const event: StreamEvent = JSON.parse(line.slice(6));
    // dispatch by event.type: status → setCurrentStatus, chunk → accumulate, done → finalize
  }
}
```

Uses `AbortController` for cleanup on unmount.

### 4.4 `components/CommandPalette.tsx`

**Critical:** Compose from `@radix-ui/react-dialog` primitives directly, NOT `components/ui/dialog.tsx` (which adds `rounded-lg`).

```typescript
import * as DialogPrimitive from "@radix-ui/react-dialog";
// Use: DialogPrimitive.Root, .Portal, .Overlay, .Content
```

**Styling:**

```typescript
// Overlay
{ background: "rgba(0,0,0,0.85)" }

// Content
{
  position: "fixed", top: "20%", left: "50%",
  transform: "translateX(-50%)",
  width: "min(560px, 92vw)",
  background: "#080808",
  border: "1px solid #2a2a2a",
  borderRadius: "2px",
  zIndex: 200,
}

// Selected command item
{ background: "#111111", borderLeft: "2px solid #ff8c00" }
```

**"/" key guard** (call this before opening):

```typescript
function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (el as HTMLElement).isContentEditable
  );
}
// In keydown handler:
if (
  e.key === "/" &&
  !e.isComposing &&
  !isEditableElement(document.activeElement)
) {
  e.preventDefault();
  setOpen(true);
}
```

**Commands:**

```
ACTION group:
  → Ask AI Companion (toggles AI slide-out panel, ⌘J)

NAVIGATE group:
  → Scroll to Top (KPI cards)
  → Skills Section (tech skills, co-occurrence, momentum)
  → Companies Section (top employers, locations)
  → Compensation Section (salary ranges, location pay)
  → System Health (queue health, market intel)
```

**Footer:** `ESC · ↑↓ · ↵` in muted monospace

### 4.5 `components/AICompanion.tsx`

**Visual structure:**

```
┌─────────────────────────────────────────────────────────┐
│ // AI COMPANION              ● READY / ◉ PROCESSING      │  ← header, 36px
│ STATUS: EXECUTING SQL...                                  │  ← amber status bar (hidden when idle)
├─────────────────────────────────────────────────────────┤
│                                                           │
│  [empty state: 4 suggested prompt chips]                  │
│                                                           │
│  ┌─── user message ──────────────────────────────────┐   │
│  │ What skills are most in demand?               ↗  │   │  ← right-aligned, #1a1a1a
│  └────────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─── assistant ─────────────────────────────────────┐   │
│  │ **Python** leads with 847 postings (36% of all    │   │  ← left-aligned, #0d0d0d
│  │ analyzed jobs)...                                  │   │
│  │                           [SQL · 847 rows]        │   │  ← query badge
│  └────────────────────────────────────────────────────┘   │
│                                                           │
│  ░░░  [typing indicator — three amber dots, staggered]   │  ← shown while streaming
│                                                           │
├─────────────────────────────────────────────────────────┤
│ > [input field — borderless, amber > prefix]   [↵ SEND] │  ← 44px footer
└─────────────────────────────────────────────────────────┘
```

**Query badge** under each completed assistant message:

```typescript
const BADGE_LABELS: Record<QueryStrategy, string> = {
  sql_only: "SQL",
  vector_only: "VECTOR",
  hybrid: "HYBRID",
  chitchat: "",
};
// styled: 9px monospace, #ff8c00 text, border: "1px solid #2a2a2a"
// shows: "SQL · 847 rows" or "VECTOR" or "HYBRID · 23 rows"
```

**Suggested prompts (shown on empty state):**

- "What skills are most in demand right now?"
- "Which companies are hiring the most?"
- "Is visa sponsorship common for ML roles?"
- "What skills pair well with Python?"

### 4.6 AI Integration in Analytics Dashboard

The analytics dashboard keeps all its charts and panels. The AI companion is a **slide-out panel** on the right side, toggled by `⌘J` or via the command palette.

```
┌──────────────────────────────────────────────────────────────┐
│ HIREFEED · LIVE · / COMMANDS · ⌘J AI                 CLOCK  │  ← TerminalHeader
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Full analytics dashboard with all charts]                  │
│  - KPI cards, volume, skills, companies, etc.                │
│  - data-section anchors for command palette navigation       │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [AIPanel — slides in from right, 480px, overlays dashboard] │
│  - backdrop click to close                                   │
│  - ESC to close (when not in input)                          │
│  - full AICompanion chat inside                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- `<CommandPaletteProvider>` + `<AIPanel>` in layout.tsx (app-wide)
- Command palette navigates to dashboard sections via `data-section` scroll targets
- No page changes — dashboard is still a server component with all existing charts

---

## 5. Implementation Phases

### Phase 1 — Spotlight + AI Companion in Analytics Terminal ✅ COMPLETE

**What was built (all in `analytics/` app):**
1. `CommandPaletteProvider.tsx` — "/" + ⌘K + ⌘J listeners, IME guard, editable-element guard, `mounted` SSR gate
2. `CommandPalette.tsx` — @radix-ui/react-dialog, section navigation, AI toggle action, `>_` prompt, arrow nav
3. `AICompanion.tsx` — chat panel with status bar, query badges, typing indicator, suggested prompts, onClose prop
4. `AIPanel.tsx` — slide-out wrapper (480px right panel), backdrop, event-driven toggle via custom events
5. `useKnowledgeBase.ts` — SSE streaming hook with ReadableStream pump, AbortController (no auth dependency)
6. `types/knowledge-base.ts` — ChatMessage, QueryPlan, StreamEvent, Command types
7. `layout.tsx` — CommandPaletteProvider + AIPanel wrapping entire analytics app
8. `page.tsx` — added `data-section` anchors for command palette section navigation
9. `TerminalHeader.tsx` — added `/ COMMANDS` and `⌘J AI` keyboard hints

**Key design decisions:**
- AI companion is a slide-out overlay panel, not a page replacement — dashboard keeps all charts
- CommandPaletteProvider wraps the entire analytics app (not scoped to one page)
- `⌘J` directly toggles AI panel (bypasses command palette for speed)
- Command palette has section navigation (scroll to Skills, Companies, etc.)
- No auth dependency in useKnowledgeBase — backend handles auth at API level
- `@radix-ui/react-dialog` added as dependency to analytics app

**Verified:** `npm run build` passes cleanly, all routes generate successfully.

### Phase 2 — SKIPPED (merged into Phase 1)

The original Phase 2 was superseded. The analytics terminal already has a full chart dashboard; the AI companion is now an overlay panel within it.

### Phase 3 — Database migrations (~1 hour)

1. Run all 6 migration blocks in Supabase SQL Editor
2. Verify: `ai_kb_reader` cannot SELECT user_resumes (run privilege check query)
3. Verify: materialized views populated (`SELECT COUNT(*) FROM mv_skill_frequency`)
4. Install `sqlglot`: `pip install sqlglot asyncpg`

### Phase 4 — Backend AI layer (~4-5 hours)

1. Add env vars to `config.py` and `.env`
2. `models/knowledge_base.py`
3. `services/knowledge_base/schema_context.py` — write the full annotated DDL + examples
4. `services/knowledge_base/prompts.py` — classifier, corrector, synthesizer prompts
5. `services/knowledge_base/sql_executor.py` — asyncpg pool + 4-layer safety
6. `services/knowledge_base_service.py` — embed_text, vector_search, backfill_embeddings
7. `services/ai_orchestrator.py` — classify_and_plan, execute_plan, synthesize_answer
8. `api/knowledge_base.py` — SSE router
9. Wire into `main.py` (router + startup + shutdown)
10. Wire embedding hook into `job_queue.py`

### Phase 5 — Frontend AI Companion (~3-4 hours)

1. `types/knowledge-base.ts`
2. `hooks/useKnowledgeBase.ts`
3. `AICompanion.tsx`
4. Replace placeholder with real `<AICompanion />`

---

## 6. File Manifest

### New Backend Files

| File                                                         | Purpose                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `backend/app/models/knowledge_base.py`                       | Pydantic models: SSEEvent, QueryPlan, KBQueryRequest     |
| `backend/app/services/knowledge_base/__init__.py`            | Package init                                             |
| `backend/app/services/knowledge_base/schema_context.py`      | Full annotated DDL, JSONB rules, Q&A examples            |
| `backend/app/services/knowledge_base/prompts.py`             | Classifier, corrector, synthesizer prompts               |
| `backend/app/services/knowledge_base/sql_executor.py`        | asyncpg pool, 4-layer safety, execute_ai_query()         |
| `backend/app/services/knowledge_base/conversation_memory.py` | In-process session store, rolling window                 |
| `backend/app/services/knowledge_base_service.py`             | embed_text(), vector_search(), backfill_embeddings()     |
| `backend/app/services/ai_orchestrator.py`                    | classify_and_plan(), execute_plan(), synthesize_answer() |
| `backend/app/api/knowledge_base.py`                          | SSE router: /query, /sessions/:id (GET+DELETE)           |
| `backend/migrations/001_kb_pgvector.sql`                     | Migration 1: pgvector extension + embedding column       |
| `backend/migrations/002_kb_indexes.sql`                      | Migration 2: GIN, trigram, temporal indexes              |
| `backend/migrations/003_kb_role.sql`                         | Migration 3: ai_kb_reader role + grants                  |
| `backend/migrations/004_kb_views.sql`                        | Migration 4: materialized views + refresh function       |
| `backend/migrations/005_kb_rpc.sql`                          | Migration 5: search_jobs_by_embedding RPC                |
| `backend/migrations/006_kb_sessions.sql`                     | Migration 6: conversation history tables + RLS           |

### Modified Backend Files

| File                                | Change                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `backend/app/core/config.py`        | Add OPENAI_API_KEY, AI_READONLY_DB_URL, KB_SQL_ROW_LIMIT, KB_EMBED_CACHE_TTL |
| `backend/app/services/job_queue.py` | Add non-fatal embedding hook in write_analysis_to_cache()                    |
| `backend/app/main.py`               | include_router, backfill_embeddings() startup task, close_pool() shutdown    |

### Analytics App Files (all ✅ COMPLETE — canonical location)

| File                                                 | Status | Purpose                                            |
| ---------------------------------------------------- | ------ | -------------------------------------------------- |
| `analytics/src/types/knowledge-base.ts`              | ✅     | ChatMessage, QueryPlan, StreamEvent, Command types |
| `analytics/src/hooks/useKnowledgeBase.ts`            | ✅     | SSE streaming hook, AbortController, no auth dep   |
| `analytics/src/components/CommandPaletteProvider.tsx` | ✅     | "/" + ⌘K + ⌘J listeners, IME guard, SSR gate       |
| `analytics/src/components/CommandPalette.tsx`         | ✅     | Radix primitives, section nav, AI toggle           |
| `analytics/src/components/AICompanion.tsx`            | ✅     | Chat panel, streaming, query badges, prompts       |
| `analytics/src/components/AIPanel.tsx`                | ✅     | Slide-out wrapper, backdrop, event-driven toggle   |
| `analytics/src/app/layout.tsx`                        | ✅     | CommandPaletteProvider + AIPanel app-wide           |
| `analytics/src/app/page.tsx`                          | ✅     | data-section anchors for command palette nav        |
| `analytics/src/components/TerminalHeader.tsx`         | ✅     | Added keyboard shortcut hints                      |

### Legacy Frontend Files (superseded — originals in `frontend/src/`)

| File                                                 | Status    | Note                                           |
| ---------------------------------------------------- | --------- | ---------------------------------------------- |
| `frontend/src/types/knowledge-base.ts`               | ⚠️ legacy | Canonical version now in analytics             |
| `frontend/src/hooks/useKnowledgeBase.ts`             | ⚠️ legacy | Has auth dependency; analytics version doesn't |
| `frontend/src/components/CommandPaletteProvider.tsx`  | ⚠️ legacy | Canonical version now in analytics             |
| `frontend/src/components/CommandPalette.tsx`          | ⚠️ legacy | Different command set; analytics version has section nav |
| `frontend/src/components/AICompanion.tsx`             | ⚠️ legacy | Analytics version has onClose prop             |
| `frontend/src/app/analytics/page.tsx`                 | ⚠️ legacy | Was full-page chatbox; analytics app has dashboard |

---

## 7. Dependencies

### Backend

```bash
pip install asyncpg>=0.29.0 sqlglot openai>=1.0.0
# openai is already installed for DeepSeek; ensure it is >= 1.0.0
```

### Analytics App

```bash
cd analytics
npm install @radix-ui/react-dialog --legacy-peer-deps
# Already installed — required for CommandPalette
```

### Frontend (jobsboard)

```bash
# No new npm packages needed
# @radix-ui/react-dialog already installed (used by shadcn)
```

---

## 8. Verification Checklist

### Spotlight + AI Panel ✅ VERIFIED

- [x] Press `/` on analytics terminal → command palette opens
- [x] Press `/` inside AI input → palette does NOT open (editable guard)
- [x] ⌘K opens command palette
- [x] ⌘J toggles AI companion slide-out panel
- [x] ArrowUp/Down navigates, Enter executes, Escape closes
- [x] "Ask AI Companion" command toggles AI panel
- [x] Section navigation scrolls to correct dashboard sections
- [x] AI panel slides in from right (480px), backdrop click closes
- [x] `npm run build` passes cleanly (verified)
- [x] Dashboard retains all charts — AI is an overlay, not a replacement

### Database

- [ ] `SELECT * FROM mv_skill_frequency LIMIT 5` returns rows
- [ ] Run: `SET ROLE ai_kb_reader; SELECT * FROM user_resumes LIMIT 1` → permission denied
- [ ] `SELECT * FROM job_analysis_cache WHERE embedding IS NOT NULL LIMIT 1` → returns rows after backfill

### AI Companion

- [ ] Ask "What skills are most in demand?" → real numbers from DB, `SQL` badge shown
- [ ] Ask "Find jobs about computer vision" → `VECTOR` badge, relevant results
- [ ] Ask a question with wrong column name → self-corrects silently, correct answer returned
- [ ] Status events visible during processing ("EXECUTING SQL...", "SYNTHESISING...")
- [ ] Second message in same session → conversation context maintained
- [ ] Ask about user resumes / personal data → AI responds with "INSUFFICIENT DATA" (SQL guard blocks it)
- [ ] New job analyzed → embedding stored automatically (check `embedding_generated_at`)

---

## 9. Key Design Decisions

| Decision           | Choice                         | Reason                                                                               |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------ |
| AI architecture    | NL2SQL + pgvector              | Unbounded queries; SQL covers 100% of structural questions                           |
| Vector index       | HNSW over IVFFlat              | No re-indexing needed as data grows; incremental, 98% recall                         |
| Distance metric    | Cosine (`<=>`)                 | Semantic similarity is directional, not magnitude-based                              |
| Embedding model    | OpenAI text-embedding-3-small  | DeepSeek has no embeddings API; $0.02/1M tokens                                      |
| LLM for chat       | DeepSeek (existing)            | Already integrated, OpenAI-compatible, zero new SDK                                  |
| SQL safety         | 4 layers + read-only role      | Defense in depth; DB role is the final backstop                                      |
| Session storage    | In-process dict                | Single-process FastAPI; trivial swap to Redis if multi-instance                      |
| Streaming          | SSE with status events         | NL2SQL requires full SQL execution before synthesis; status events prevent UI freeze |
| Materialized views | Yes, refreshed every 50 jobs   | JSONB unnest at 100K rows = 500ms-2s; MV pre-computes it                             |
| Embedding on write | Non-fatal hook in job_queue.py | Zero behaviour change if OPENAI_API_KEY absent                                       |
