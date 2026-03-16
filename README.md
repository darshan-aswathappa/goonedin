# HireFeed

**Real-time job tracking and analysis platform.** HireFeed scrapes job postings from LinkedIn, GitHub, MathWorks, Jobright, Indeed, and custom ATS sources, analyzes them with AI, matches against your resume, and delivers updates instantly via WebSocket.

Live at [hirefeed.io](https://hirefeed.io)

---

## Why HireFeed

Job hunting means checking dozens of sites daily, reading repetitive descriptions, and guessing whether you're qualified. HireFeed eliminates that:

- **One feed, all sources** — LinkedIn, GitHub SimplifyJobs, MathWorks, Jobright, Indeed, and any Greenhouse/ATS board you add
- **AI reads every job for you** — DeepSeek extracts must-have skills, nice-to-haves, salary, visa status, and a plain-English summary
- **Resume matching** — Upload your resume, get a match score against every posting
- **Real-time push** — New jobs appear in your feed the moment they're scraped, no refreshing
- **Smart filtering** — Target keywords, locations, title filters, company blocking
- **Market intelligence** — Ask the AI chatbox "What skills are most in demand?" and get answers backed by your actual job data

---

## Features

### Job Aggregation
| Source | Method | Frequency |
|--------|--------|-----------|
| LinkedIn | HTML scraping | ~5 min |
| GitHub SimplifyJobs | JSON API | ~30 min |
| MathWorks | HTML scraping | ~30 min |
| Jobright | REST API (authenticated) | ~10 min |
| Indeed | HTML scraping + description pre-fetch | ~10 min |
| Custom (Greenhouse) | REST API (structured JSON) | User-configured |
| Custom (generic) | Playwright + DeepSeek extraction | User-configured |

### AI Analysis
- **Job parsing**: Must-have keywords, nice-to-have keywords, minimum qualifications, compensation, visa sponsorship
- **Resume parsing**: Education, certifications, skills, project keywords extracted from uploaded PDFs
- **Keyword matching**: Fuzzy match resume skills against job requirements
- **Knowledge base**: Natural-language queries against your job data ("Which companies hire the most remote engineers?") with streaming AI answers

### Personalization
- **Target keywords** — Only see jobs matching your skills/interests
- **Location filters** — Filter by US states and cities
- **Title filters** — Exclude irrelevant job titles
- **Company blocking** — Permanently hide all jobs from specific companies
- **Save/dismiss** — Bookmark jobs or remove them from your feed

### Real-Time Updates
- WebSocket push notifications per user (multi-tab/device support)
- Message types: `NEW_JOB`, `UPDATE_JOB`, `JOB_DISMISSED`, `COMPANY_BLOCKED`, `CUSTOM_SOURCE_STATUS`, `SCRAPE_CYCLE`
- Exponential backoff reconnection (1s to 30s)
- Live scraper activity logs

### Analytics Dashboard
- Top hiring companies (bar chart)
- Most in-demand skills (must-have vs nice-to-have)
- Work model distribution (remote / hybrid / on-site)
- Salary range distribution
- Location heatmap
- AI chatbox for querying trends

---

## Architecture

```
                                 +------------------+
                                 |    Frontend      |
                                 |  Next.js + React |
                                 |  Zustand store   |
                                 +--------+---------+
                                          |
                          REST (HTTP) + WebSocket (WS)
                                          |
                                 +--------+---------+
                                 |     Backend      |
                                 |     FastAPI      |
                                 +--------+---------+
                                          |
              +---------------------------+---------------------------+
              |                           |                           |
     +--------+--------+       +---------+---------+       +---------+---------+
     | Scraper Loops    |       | Job Analysis      |       | Resume Service   |
     | (per-user,       |       | Queue Worker      |       | (microservice)   |
     |  per-source)     |       | (sequential,      |       | PDF extraction   |
     |                  |       |  DeepSeek API)    |       | + DeepSeek       |
     +--------+---------+       +---------+---------+       +---------+---------+
              |                           |                           |
              +---------------------------+---------------------------+
                                          |
                                 +--------+---------+
                                 |    Supabase      |
                                 |   PostgreSQL     |
                                 |  + pgvector      |
                                 |  + Storage       |
                                 |  + Auth          |
                                 +------------------+
```

### Data Flow

1. **Scrape** — Per-user scraper loops fetch jobs from each source on schedule
2. **Deduplicate** — In-memory dict + Supabase unique constraints prevent duplicates
3. **Filter** — Jobs matched against user's target keywords and location preferences
4. **Analyze** — New jobs queued for DeepSeek analysis (sequential, one at a time)
5. **Cache** — Analysis results stored in `job_analysis_cache` (upsert, not update)
6. **Push** — WebSocket broadcasts `NEW_JOB` / `UPDATE_JOB` to connected clients
7. **Display** — Frontend updates Zustand store, renders in real-time

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| State | Zustand |
| Backend | FastAPI, Python 3.11, Uvicorn |
| Database | Supabase PostgreSQL + pgvector |
| File Storage | Supabase Storage (resume PDFs) |
| Auth | Supabase Auth (magic link, passwordless) |
| AI | DeepSeek API (job analysis, resume parsing, NL2SQL) |
| Embeddings | OpenAI API (for pgvector semantic search) |
| Scraping | Playwright (JS-heavy sites), Beautiful Soup (HTML), REST APIs |
| Real-time | WebSocket (FastAPI native) |
| Resume Service | FastAPI microservice, PyPDF2 |
| Deployment | Docker Compose, GitHub Actions, Hetzner VPS |
| UI Components | shadcn/ui (Card, Dialog, Badge, Tabs, Progress) |
| Icons | Phosphor Icons |
| Charts | Recharts |
| Notifications | Sonner (toast) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Supabase project (with tables created)
- DeepSeek API key

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in credentials
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Resume Service

```bash
cd resume_service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in URLs
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database Migrations

Run the SQL migration files in `backend/migrations/` (001 through 007) via the Supabase SQL Editor, in order. Additionally, the Greenhouse ATS integration requires:

```sql
ALTER TABLE custom_sources ADD COLUMN ats_type TEXT DEFAULT 'other';
ALTER TABLE custom_sources ADD COLUMN department TEXT;
```

### Docker (Backend + Resume Service)

```bash
cd backend
docker-compose up --build
```

This starts the backend on `:8000` and resume service on `:8001`.

---

## Configuration

### Backend Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SUPABASE_JWT_SECRET` | JWT secret for token validation |
| `SUPABASE_DB_URL` | Direct PostgreSQL connection string (for AI knowledge base) |
| `DEEPSEEK_API_KEY` | DeepSeek API key (job analysis + resume parsing) |
| `OPENAI_API_KEY` | OpenAI API key (embeddings only) |
| `RESUME_SERVICE_URL` | Resume microservice URL (default: `http://resume-service:8001`) |
| `JOBRIGHT_EMAIL` | Jobright account email (optional) |
| `JOBRIGHT_PASSWORD` | Jobright account password (optional) |
| `ANALYSIS_WORKER_CONCURRENCY` | Analysis worker pool size (default: 3; jobs still processed sequentially per worker) |
| `KB_SQL_ROW_LIMIT` | Max rows returned by AI SQL queries (default: 500) |
| `PROXY_URL` | HTTP proxy for scraping requests (optional, recommended for LinkedIn) |
| `JOBRIGHT_COOKIE` | Jobright session cookie (alternative to email/password auth) |
| `AI_READONLY_DB_URL` | Legacy read-only DB connection for AI knowledge base (fallback) |
| `KB_EMBED_CACHE_TTL` | Embedding cache TTL in seconds (default: 3600) |
| `ENVIRONMENT` | `production` or `development` |

### Frontend Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL (`ws://` or `wss://`) |

---

## API Reference

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/jobs` | Fetch all visible jobs (paginated) |
| `POST` | `/jobs/analyze` | Queue job for AI analysis |
| `GET` | `/jobs/{id}/analysis` | Get cached analysis |
| `POST` | `/jobs/dismiss` | Dismiss a job |
| `POST` | `/jobs/block` | Block a company |
| `POST` | `/jobs/save` | Save/bookmark a job |
| `GET` | `/jobs/saved` | List saved jobs |
| `DELETE` | `/jobs/saved/{id}` | Unsave a job |

### Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/config` | All user config |
| `GET/PUT` | `/config/target-keywords` | Manage target keywords |
| `GET/PUT` | `/config/target-locations` | Manage target locations |
| `GET/PUT` | `/config/blocked-companies` | Manage blocked companies |
| `GET/PUT` | `/config/title-filter-keywords` | Manage title filters |

### Custom Sources

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/config/custom-sources` | List custom ATS sources |
| `POST` | `/config/custom-sources` | Add a custom source |
| `PUT` | `/config/custom-sources/{id}` | Update a source |
| `DELETE` | `/config/custom-sources/{id}` | Delete a source |

### Resumes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/resumes` | List uploaded resumes |
| `POST` | `/resumes` | Upload a resume (PDF) |
| `DELETE` | `/resumes/{id}` | Delete a resume |
| `GET` | `/resumes/{id}/analysis` | Get resume analysis |

### Knowledge Base

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/knowledge-base/query` | AI query (SSE streaming response) |

### WebSocket

Connect to `ws://<host>/ws/jobs?token=<jwt>` for real-time updates.

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `scraped_jobs` | Primary job storage (per-user, per-source) |
| `job_analysis_cache` | AI analysis results (keyed by `external_id`) |
| `job_analysis_queue` | Background processing queue |
| `custom_sources` | User-defined ATS sources |
| `custom_source_jobs` | Jobs from custom sources |
| `saved_jobs` | User bookmarks |
| `user_configs` | Per-user configuration root |
| `user_settings` | Keywords, locations, blocked companies |
| `user_resumes` | Resume file metadata |
| `resume_analysis` | Parsed resume data (skills, education, etc.) |
| `resume_analysis_queue` | Background resume processing queue |
| `ai_kb_sessions` | AI chatbox conversation sessions |
| `ai_kb_messages` | Conversation message history |

### Key Indexes

- **pgvector HNSW** on `job_analysis_cache.embedding` for semantic search
- **Trigram (TRGM)** on company and title columns for substring search
- **GIN** on analysis JSONB for keyword containment queries
- **Composite** `(user_id, source, external_id)` for deduplication

### Row-Level Security

All user-facing tables enforce `user_id = auth.uid()`. The AI knowledge base uses a read-only `ai_kb_reader` role with `BYPASSRLS` for aggregate queries, with explicit `REVOKE` on PII tables.

### Migrations

SQL migration files live in `backend/migrations/`. Apply them in order (001-007) via the Supabase SQL Editor.

---

## Deployment

### Production Stack

- **Backend + Resume Service**: Docker Compose on Hetzner VPS
- **Frontend**: Deployed separately (Next.js hosting)
- **Database**: Supabase managed PostgreSQL
- **CI/CD**: GitHub Actions (push to `main` triggers deploy)

### Deploy Workflow

```
Push to main (backend/) → GitHub Actions → SSH to Hetzner → git pull → docker-compose up --build
```

### Docker Compose Services

| Service | Port | Description |
|---------|------|-------------|
| `app` | 8000 | FastAPI backend |
| `resume-service` | 8001 | Resume analysis microservice |

The `app` service waits for `resume-service` to be healthy before starting.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **DeepSeek over GPT-4** | ~60% cheaper, fast enough for NL2SQL and job description parsing |
| **pgvector over Pinecone** | Single database (no sync issues), sufficient at our scale, lower cost |
| **Zustand over Redux** | Minimal boilerplate, direct state mutations, fits mid-size state |
| **Playwright over Selenium** | Better async support (fits FastAPI), faster, modern API |
| **Greenhouse REST API** | Returns structured JSON (no scraping/AI parsing needed), official API |
| **Sequential job analysis** | Prevents DeepSeek rate limits, predictable processing order |
| **Upsert (not update)** | Prevents silent 0-rows-affected failures in cache writes |
| **Per-user scraper loops** | Each user gets independent scraping with their own filters/sources |
| **Magic link auth** | Passwordless via Supabase, zero custom auth code |
| **Microservice for resumes** | Independent scaling, isolated failure domain, separate dependencies |

---

## Important Patterns

These patterns were established through production debugging and should be preserved:

1. **Cache writes use `upsert()` with `on_conflict="external_id"`** — never `update()`. Using update on non-existent rows silently affects 0 rows.

2. **Job analysis worker processes sequentially** — `.limit(1)` + `await _process_one()`. Not `create_task()` which runs concurrently.

3. **Completed jobs skip re-enqueue** — `enqueue_job()` checks `job_analysis_cache` before re-queuing. Prevents completed jobs reverting to pending.

4. **Custom sources route by `ats_type`** — `"greenhouse"` uses the REST API scraper; everything else uses Playwright + DeepSeek.

5. **Worker changes require restart** — FastAPI's `--reload` doesn't catch background task changes in `job_queue_worker.py`.

6. **Three deduplication layers** — In-memory dict (per-session) + Supabase unique constraint + analysis cache lookup.

7. **AI knowledge base is read-only** — `ai_kb_reader` role has SELECT only, BYPASSRLS for aggregates, explicit REVOKE on PII tables, 500-row cap.

---

## Project Structure

```
goonedin/
├── backend/
│   ├── app/
│   │   ├── main.py                 # REST endpoints + scraper lifecycle
│   │   ├── api/
│   │   │   ├── websocket.py        # WebSocket connection manager
│   │   │   └── knowledge_base.py   # AI query SSE endpoint
│   │   ├── core/
│   │   │   ├── auth.py             # JWT validation
│   │   │   ├── config.py           # Settings (Pydantic)
│   │   │   └── user_manager.py     # Per-user context
│   │   ├── models/                 # Pydantic schemas
│   │   └── services/
│   │       ├── scraper_*.py        # Source-specific scrapers
│   │       ├── job_analyzer.py     # DeepSeek analysis
│   │       ├── job_queue_worker.py # Background worker
│   │       ├── job_queue.py        # Queue operations
│   │       └── knowledge_base/     # AI chatbox services
│   ├── migrations/                 # SQL migration files
│   ├── Dockerfile
│   └── docker-compose.yml
├── frontend/
│   └── src/
│       ├── app/                    # Next.js pages
│       ├── components/             # React components
│       ├── hooks/                  # Custom hooks (WS, auth, API)
│       ├── store/                  # Zustand state
│       └── lib/                    # Utilities
├── resume_service/
│   ├── main.py                     # /analyze, /match endpoints
│   ├── analyzer.py                 # PDF + DeepSeek
│   └── Dockerfile
└── CLAUDE.md
```

---

## License

Private repository. All rights reserved.
