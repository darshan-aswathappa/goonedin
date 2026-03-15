# HireFeed Backend Architecture Audit
**Date:** 2026-03-14
**Auditor:** Backend Architect (Claude)
**Scope:** Full backend — FastAPI app, scrapers, queue workers, WebSocket, resume service, database layer

---

## Executive Summary

HireFeed is a real-time job tracking platform with a FastAPI backend, Supabase (PostgreSQL), multiple scrapers (LinkedIn, GitHub, MathWorks, Jobright, custom ATS), a DeepSeek AI analysis pipeline, and a WebSocket delivery layer. The core architecture is sound for a single-developer project at its current scale — the queue-based deduplication, per-user scraper lifecycle, and layered caching approach are well-reasoned. Several historical bugs (cache upsert, sequential processing, reconnect debounce) have been found and fixed, which is a positive signal.

However, the audit found **three critical security issues** that must be addressed before any production deployment with real users, along with several high-priority reliability and scalability concerns that will cause problems as user count grows.

**Risk Summary:**
- Critical: 3 issues (JWT signature bypass, wildcard CORS, credentials in plaintext `.env`)
- High: 6 issues
- Medium: 8 issues
- Low/Improvements: 9 items

---

## Critical Issues

### CRIT-1: JWT Signature Verification Disabled
**File:** `backend/app/core/auth.py`, lines 16–18
**Severity:** Critical — Authentication bypass

The `validate_token()` function decodes JWTs with `options={"verify_signature": False}`. This means **any crafted JWT with a matching issuer and audience claim will be accepted as valid**, regardless of whether Supabase actually issued it. An attacker who knows your Supabase project URL can forge arbitrary user identities.

```python
payload = jwt.decode(
    token,
    key="",
    algorithms=["ES256"],
    options={"verify_signature": False, "verify_aud": False}  # DANGEROUS
)
```

The comment says "We trust Supabase as the issuer and verify claims below," but verifying the issuer string in the payload does not require disabling signature verification — the issuer string itself can be forged in the unsigned token.

**Recommendation:** Use the actual Supabase JWT secret (`SUPABASE_JWT_SECRET`) to verify signatures. For asymmetric JWTs (ES256), obtain the JWKS endpoint from Supabase and verify against the public key. At minimum, use the `SUPABASE_JWT_SECRET` with HS256 if that is what your Supabase project is configured to use. This is a one-line fix once the correct key/algorithm is confirmed.

---

### CRIT-2: Wildcard CORS in Production
**File:** `backend/app/main.py`, lines 169–175
**Severity:** Critical — Enables cross-origin request forgery from any domain

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Allows ALL origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

`allow_origins=["*"]` combined with `allow_credentials=True` is a misconfiguration — browsers actually block `credentials: true` requests when origin is `*`, so this combination either fails silently or gets bypassed depending on the client. More critically, any website can make cross-origin requests to your API. The correct pattern is an explicit allowlist of origins from an environment variable.

**Recommendation:**
```python
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, ...)
```

---

### CRIT-3: Plaintext Credentials in Committed `.env` File
**File:** `backend/.env` (committed to repository)
**Severity:** Critical — Secret exposure

The `.env` file containing actual credentials (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `DEEPSEEK_API_KEY`, `JOBRIGHT_EMAIL`, `JOBRIGHT_PASSWORD`) appears to be committed to version control (the file exists at `backend/.env` alongside `.env.example`). The `.env.example` file also references `REDIS_URL` and `TELEGRAM_BOT_TOKEN` suggesting old credentials may also be present.

**Recommendation:**
1. Immediately rotate all secrets if the `.env` file has ever been pushed to a remote repository.
2. Add `backend/.env` to `.gitignore` immediately.
3. Verify with `git log --all -- backend/.env` to check commit history.
4. Use environment variable injection at the infrastructure level (Docker secrets, cloud provider KMS, or CI/CD environment variables) rather than file-based secrets.

---

## High Priority Issues

### HIGH-1: `bulk_apply_analysis` Updates Across All Users Without Scope Guard
**File:** `backend/app/services/supabase_jobs.py`, lines 368–393

The `bulk_apply_analysis()` and `bulk_mark_unavailable()` functions update **all rows** matching `external_id` across the entire `scraped_jobs` table, without filtering by `user_id`:

```python
await asyncio.to_thread(
    lambda: supabase.table("scraped_jobs")
    .update(updates)
    .eq("external_id", external_id)   # No user_id filter!
    .execute()
)
```

This means when job analysis completes for one user, it will update the `visible`, `analysis`, and `salary` fields for that same `external_id` in every other user's rows — including users who may have dismissed the job (which sets `visible=False`) or who belong to a different context. A dismissed job can be made visible again by another user's analysis completing.

**Recommendation:** Add `.eq("visible", False)` to only update rows that are still in pending/invisible state, or add a status field filter. The `get_users_with_pending_job()` function already queries for `visible=False` rows — the bulk update should match that same predicate.

---

### HIGH-2: `process_and_alert_jobs` Source-Routing Heuristic Is Fragile
**File:** `backend/app/main.py`, lines 208–224

Job routing uses a heuristic based on inspecting `first_job.source` from the results list:

```python
if first_job.source == "MathWorks":
    mathworks_jobs.extend(r["recent_jobs"])
elif first_job.source == "GitHub":
    github_jobs.extend(r["recent_jobs"])
else:
    all_jobs.extend(r["jobs"])
```

This silently fails if the result list is empty (list index error on `r["recent_jobs"][0]`), and it will misroute jobs if a scraper returns a mix of sources. The code also checks `r["recent_jobs"]` first and falls into the `all_jobs` path for Jobright via a different branch using `r["jobs"]` and source detection. This dual-path logic is prone to silent data loss when result structures change slightly.

**Recommendation:** Have each scraper return a typed result with a `scraper_name` key at the top level (e.g., `{"scraper": "mathworks", "jobs": [...], ...}`) so routing is unambiguous and does not depend on runtime data inspection.

---

### HIGH-3: In-Memory State Not Safe for Multi-Worker Deployments
**Files:** `backend/app/main.py` (`_seen_linkedin` dict), `backend/app/core/supabase_config.py` (`_cache` dict), `backend/app/services/supabase_jobs.py` (`_jobs_cache` dict), `backend/app/services/custom_source_supabase.py` (`_custom_jobs_cache`, `_custom_sources_cache` dicts), `backend/app/services/scraper_jobright.py` (`_last_jobright_fetch` module-level variable)

The application maintains multiple in-memory caches and deduplication structures. In a single-process deployment this is fine, but the moment you run two Uvicorn workers (`--workers 2`) or deploy two container replicas:
- `_seen_linkedin` will not be shared — both workers will process the same LinkedIn job, causing duplicate DB inserts and double WebSocket broadcasts.
- `_last_jobright_fetch` will not coordinate cooldowns — both workers will hit Jobright simultaneously every 10 minutes, doubling API load.
- Config caches will drift between instances on write, causing inconsistent filter behavior.
- The `user_registry` dict means user scraper tasks only run in one process; the other serves API requests with no scrapers.

**Recommendation:** For now, document that the service must run as a single process (one worker). Long-term, move the dedup cache to Redis or a Supabase row with an `ON CONFLICT DO NOTHING` and remove the in-memory structure.

---

### HIGH-4: Resume Deletion Has No Atomic Guarantee — Partial Failure Leaves Orphaned Storage Files
**File:** `backend/app/main.py`, lines 1251–1309

The delete resume endpoint performs three sequential operations without a transaction:
1. Fetch file path
2. Delete from Supabase Storage
3. Delete queue items, analysis rows, and the resume DB row

If step 2 succeeds but step 3 fails (network error, exception), the storage file is deleted but the database record remains, pointing to a nonexistent file. Subsequent analysis attempts will fail silently with no way to recover.

Conversely, if the DB delete at step 3 succeeds but storage delete at step 2 already ran partially, you have orphaned storage objects.

**Recommendation:** Reverse the order — delete DB records first (they are cheap to re-insert), then delete the storage object. Use a `try/finally` or a cleanup task to catch storage orphans. Consider a soft-delete flag on `user_resumes` before committing the storage deletion.

---

### HIGH-5: `get_all_jobs` TTL Filtering Done in Python, Not SQL
**File:** `backend/app/services/supabase_jobs.py`, lines 190–226

```python
for row in (resp.data or []):
    # Skip expired jobs
    if row.get("expires_at") and row["expires_at"] < now_iso:
        continue
```

All rows for a user are fetched from the database, then expired jobs are filtered out in Python. For a user with thousands of jobs, this fetches all that data over the network only to discard it. The cleanup loop only runs every 5 minutes, so there can be a window where stale data is fetched and filtered in memory.

**Recommendation:** Add `.gt("expires_at", now_iso)` or `.or_("expires_at.is.null,expires_at.gt." + now_iso)` to the Supabase query to push the filter to the database. This also requires ensuring `expires_at` has a database index.

---

### HIGH-6: `analyze_job_with_deepseek` Is Synchronous and Blocks the Thread Pool
**File:** `backend/app/services/job_analyzer.py`, lines 127–170

The DeepSeek API call uses the synchronous `OpenAI` client via `asyncio.to_thread()`. The OpenAI Python SDK v1+ supports async natively (`openai.AsyncOpenAI`). Running the synchronous client in `to_thread` uses a thread from Python's default thread pool (typically 8–16 threads). During peak hours with many jobs in the queue, this can starve the thread pool and block unrelated `asyncio.to_thread()` calls (e.g., Supabase queries).

The same issue exists in `resume_service/analyzer.py` (line 48–60) and `backend/app/services/scraper_custom.py` (line 60–97).

**Recommendation:** Replace `OpenAI(...)` with `AsyncOpenAI(...)` and `await client.chat.completions.create(...)` directly. This removes the thread pool dependency entirely for AI calls.

---

## Medium Priority Issues

### MED-1: WebSocket Authentication Uses Query Parameter Token
**File:** `backend/app/api/websocket.py`, lines 72–73

```python
@router.websocket("/ws/jobs")
async def websocket_endpoint(websocket: WebSocket, token: str = None):
```

The JWT is passed as a URL query parameter (`ws://host/ws/jobs?token=...`). Query parameters are logged by web servers, proxies, and load balancers, which means **JWTs appear in access logs in plaintext**. They are also visible in browser history and the URL bar.

**Recommendation:** Accept the token in the first WebSocket message after connection (standard handshake pattern), or use the `Sec-WebSocket-Protocol` header as a carrier. At minimum, ensure any reverse proxy (nginx, Cloudflare) is configured to strip or not log the `token` query parameter.

---

### MED-2: `enqueue_job` Has a TOCTOU Race Condition
**File:** `backend/app/services/job_queue.py`, lines 115–141

The function first reads the cache to check if a job is `completed`, then conditionally upserts to the queue. Between the read and the upsert, another request for the same job could change the cache state. More practically: if two users scrape the same LinkedIn job simultaneously, both calls to `enqueue_job()` may read `None` from the cache and both upsert to the queue, creating two queue entries for the same job.

The `on_conflict="external_id"` in the upsert provides some protection (it won't duplicate rows), but it will **reset a failed job back to `pending`** if it was previously failed and a new user encounters the same job. The upsert row includes `"status": "pending"` and `"retry_count": 0`.

**Recommendation:** Use a database-level `INSERT ... ON CONFLICT DO NOTHING` (by setting `ignore_duplicates=True` on the upsert) so that existing queue entries — in any state — are never overwritten by concurrent scrapes.

---

### MED-3: Custom Source URL Is Passed to Playwright Without Sanitization
**File:** `backend/app/services/scraper_custom.py`, lines 120–136

A user-supplied URL from `CustomJobSource` is passed directly to `page.goto(str(source.url))`. While Pydantic's `HttpUrl` validates that it is a valid HTTP/HTTPS URL, Playwright will faithfully navigate to `file://`, `javascript:`, or `data:` URLs if the validation is bypassed or the `HttpUrl` type is coerced. An attacker who can inject a source URL pointing to a local file path (e.g., `file:///etc/passwd`) could potentially read server-side files.

**Recommendation:** Add an explicit scheme check before Playwright navigation: assert `url.scheme in ("http", "https")`. Also consider a domain allowlist or at minimum a blocklist of private IP ranges (`127.0.0.1`, `10.x.x.x`, `192.168.x.x`, `169.254.x.x`) to prevent SSRF against internal services.

---

### MED-4: `delete_jobs_by_company` Uses Python-Side Filtering Instead of SQL ILIKE
**File:** `backend/app/services/supabase_jobs.py`, lines 236–296

The function fetches all visible jobs for a user and does string matching in Python:

```python
if company_lower in job_company or job_company == company_lower:
```

For a user with 5,000 jobs, this fetches the entire job list over the network to find records matching one company name. Supabase/PostgreSQL supports `ilike` for case-insensitive pattern matching.

**Recommendation:** Use `.ilike("company", f"%{company}%")` directly in the Supabase query to push the filter to the database.

---

### MED-5: `_scrapers_started` Guard Is Not Thread-Safe
**File:** `backend/app/main.py`, line 606; `start_user_scrapers()` lines 603–620

The guard uses `getattr(ctx, "_scrapers_started", False)` and then sets it at the end of the function. Between the check and the set, two concurrent requests for the same new user (e.g., two simultaneous WebSocket connections) could both pass the check and start duplicate scraper tasks. Each duplicate scraper loop will independently query Supabase, insert duplicate jobs, and broadcast duplicate WebSocket events.

**Recommendation:** Use `asyncio.Lock()` per `UserContext` to serialize the startup check. Alternatively, set `_scrapers_started = True` as the very first line of the function body (before any `create_task` calls) so that reentrant calls bail early.

---

### MED-6: `_status_cb` Closure in `run_custom_sources_loop` Captures Mutable Loop Variable
**File:** `backend/app/main.py`, lines 469–474

```python
for src_row in custom_sources:
    ...
    async def _status_cb(status, msg):
        await update_source_status(supabase, source.id, ctx.user_id, status, msg)
        ...
```

The closure captures `source` by reference, not by value. Because `source` is reassigned on each loop iteration, if `_status_cb` is called after the loop has advanced (e.g., in an async context), it will use the wrong source. In Python, `source` inside `_status_cb` will refer to the loop variable's current binding, not the binding at closure creation time.

**Recommendation:** Use a default argument to bind the value: `async def _status_cb(status, msg, _source=source):` and then reference `_source` inside the function body.

---

### MED-7: `get_job_analysis` Endpoint Hard-Codes Source as "LinkedIn"
**File:** `backend/app/main.py`, line 1154

```python
job_data = await get_job(supabase, ctx.user_id, "LinkedIn", external_id)
```

This endpoint is used for any job analysis lookup, but it hard-codes the source. Jobs from GitHub, MathWorks, Jobright, or custom sources will never return analysis from this endpoint, even if analysis is later added for those sources.

**Recommendation:** Remove the source parameter from the `get_job()` lookup in this endpoint, or accept `source` as a query parameter.

---

### MED-8: `analyze_job_with_deepseek` Initializes `OpenAI` Client on Every Call
**File:** `backend/app/services/job_analyzer.py`, lines 131–133

```python
def analyze_job_with_deepseek(description: str, api_key: str) -> dict[str, Any]:
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.deepseek.com",
    )
```

A new `OpenAI` client (and implicitly, a new `httpx` connection pool) is instantiated on every call. The same pattern appears in `scraper_custom.py` lines 60–63. This means HTTP connections are not reused, increasing latency and resource consumption.

**Recommendation:** Create a module-level singleton client, or at minimum pass it in as a parameter from the caller who can cache it.

---

## Low Priority / Improvements

### LOW-1: `backend/app/main.py` Is Too Large (1,400+ Lines)
The main application file contains the FastAPI app definition, all REST endpoints, all scraper loop implementations, the startup lifecycle, job processing logic, and helper functions. This makes it very hard to navigate, test independently, and reason about. Any change touches code that affects multiple concerns.

**Recommendation:** Extract scraper loops into `backend/app/services/scraper_loops.py`, REST endpoints into route files under `backend/app/api/routes/` (e.g., `jobs.py`, `config.py`, `resumes.py`), and the job processing functions into `backend/app/services/job_processor.py`.

---

### LOW-2: `retry_supabase` Not Used Consistently
**File:** `backend/app/core/supabase_retry.py`

The retry utility is used only in `get_all_jobs`, `get_custom_jobs`, and `get_custom_sources`. Dozens of other Supabase calls throughout the codebase use bare `asyncio.to_thread(lambda: ...)` with no retry logic. Transient network errors to Supabase will surface as unhandled exceptions in those code paths.

**Recommendation:** Adopt `retry_supabase` as the standard pattern for all Supabase I/O calls, or implement it as a decorator.

---

### LOW-3: `JobBase.posted_at` Uses Deprecated `datetime.utcnow()`
**File:** `backend/app/models/job.py`, line 14

```python
posted_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
```

`datetime.utcnow()` is deprecated in Python 3.12+ and returns a naive datetime. This is inconsistent with the rest of the codebase which uses `datetime.now(timezone.utc)`.

**Recommendation:** Change to `Field(default_factory=lambda: datetime.now(timezone.utc))`.

---

### LOW-4: `.env.example` Is Stale and Misleading
**File:** `backend/.env.example`

The example file references `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `REDIS_URL` — none of which are used in the current codebase. It is missing `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `DEEPSEEK_API_KEY`, and `RESUME_SERVICE_URL`. A developer setting up the project from scratch would be confused and miss required variables.

**Recommendation:** Rewrite `.env.example` to match `backend/app/core/config.py` exactly.

---

### LOW-5: `ANALYSIS_WORKER_CONCURRENCY` Config Is Misleading
**File:** `backend/app/core/config.py`, line 32; `backend/app/services/job_queue_worker.py`, line 38

The config sets `ANALYSIS_WORKER_CONCURRENCY = 3` by default, but the worker loop uses `.limit(1)` and `await _process_one()` sequentially. The semaphore is acquired but since only one job is fetched per poll cycle, the semaphore limit is never actually the constraint — the sequential `await` is. The config gives the impression that parallelism is configurable when it is not.

**Recommendation:** Either remove the semaphore and document that processing is intentionally sequential, or change the polling logic to fetch up to `ANALYSIS_WORKER_CONCURRENCY` jobs and process them concurrently (which was the apparent original design).

---

### LOW-6: Playwright Browser Not Reused Across Custom Source Scrapes
**File:** `backend/app/services/scraper_custom.py`, lines 120–136

A new Chromium browser instance is launched and destroyed for every single custom source scrape. If a user has 5 custom sources, that is 5 full browser launches per scrape cycle. Chromium startup takes 1–3 seconds and consumes ~100–200MB RAM each.

**Recommendation:** Maintain a shared `Browser` instance (or `BrowserContext` pool) at the module level with a persistent lifecycle, closing and re-launching only on error.

---

### LOW-7: `verify=False` in Jobright SSL Requests
**File:** `backend/app/services/jobright_session.py`, line 114; `backend/app/services/scraper_jobright.py`, line 192

Both `AsyncSession` calls pass `verify=False`, which disables TLS certificate verification. This opens the connection to man-in-the-middle attacks, particularly significant since these calls transmit login credentials.

**Recommendation:** Remove `verify=False` and trust the system's CA bundle. If you need to bypass verification for a specific proxy, consider using a custom CA cert instead.

---

### LOW-8: `get_logs` Endpoint Has No Pagination or User Isolation
**File:** `backend/app/main.py`, line 973–976

The log buffer (`_log_buffer` in `log_handler.py`) is a single global ring buffer shared across all users. The `/logs` endpoint returns the last N entries regardless of which user is requesting. User A can see log messages generated while processing User B's jobs.

**Recommendation:** If log visibility is intended to be per-user (as the `BroadcastLogHandler` setup suggests — it only adds handlers for `VelocityMain` and `VelocityScraper`), the ring buffer should be keyed by user_id. If global logs are intentional (for admins), restrict the endpoint to admin/service roles.

---

### LOW-9: Missing Request Body Size Limit on Resume Upload
**File:** `backend/app/main.py`, lines 1191–1248

The `POST /resumes` endpoint reads the entire uploaded file into memory with `await file.read()` before any size check. A malicious user can upload a multi-gigabyte file and exhaust the server's memory.

**Recommendation:** Add a size check immediately after `await file.read()`:
```python
MAX_RESUME_SIZE = 10 * 1024 * 1024  # 10MB
if len(content) > MAX_RESUME_SIZE:
    raise HTTPException(status_code=413, detail="File too large")
```
Or, use FastAPI's `UploadFile.size` attribute (if populated) before reading.

---

## Positive Findings

The following patterns are well-implemented and worth preserving:

1. **Queue-based deduplication with cache-before-enqueue check** (`job_queue.py:enqueue_job`): The fix that checks cache status before upserting prevents completed jobs from being re-queued. The upsert-based cache write (`write_analysis_to_cache`) is the correct approach vs. the prior update()-only path.

2. **Sequential job processing with optimistic lock** (`job_queue_worker.py`): The single `await _process_one()` pattern with `status=processing` optimistic lock prevents concurrent analysis of the same job. The startup reset of stuck `processing` rows is a correct recovery pattern for crash scenarios.

3. **Per-user WebSocket isolation** (`websocket.py:ConnectionManager`): The `dict[str, List[WebSocket]]` structure correctly ensures each user only receives their own job events. The dead connection pruning during broadcast is clean.

4. **In-memory config cache with write-through invalidation** (`supabase_config.py`): Caching user settings with TTL and instant invalidation on write avoids per-job Supabase reads in hot scraper loops. The pattern is correct and will handle 10x users without modification.

5. **Exponential backoff retry on job analysis** (`job_queue_worker.py`, lines 144–165): The retry logic with `30 * 2^retry_count` backoff up to 600 seconds is well-structured and prevents hammering a failing API.

6. **`insert_job_if_new` with `ignore_duplicates=True`** (`supabase_jobs.py`): This pattern correctly prevents dismissed jobs from reappearing by never overwriting existing rows. The return of `None` on no-insert is a clean contract for callers.

7. **`asyncio.to_thread()` for all blocking Supabase calls**: The entire codebase correctly wraps synchronous Supabase SDK calls in `asyncio.to_thread()`, preserving event loop responsiveness.

8. **Jobright session manager with double-checked locking** (`jobright_session.py`): The `asyncio.Lock()` with double-check pattern correctly handles concurrent session refresh requests. The fallback to static cookie is a good degradation path.

9. **Per-user scraper lifecycle with task cancellation on shutdown** (`main.py:lifespan`): The lifespan function correctly cancels all background tasks on shutdown, preventing resource leaks.

10. **Last-known-good cache fallback on Supabase errors** (`supabase_jobs.py`, `custom_source_supabase.py`): Falling back to cached data on transient DB failures prevents UI empty-state flashes. This is a thoughtful reliability improvement.

---

## Recommended Remediation Priority

### Immediate (Before Production with Real Users)
| ID | Issue | Effort |
|----|-------|--------|
| CRIT-1 | Enable JWT signature verification | 1 hour |
| CRIT-2 | Restrict CORS to explicit origin list | 30 min |
| CRIT-3 | Remove `.env` from repo, rotate secrets | 2 hours |

### This Sprint
| ID | Issue | Effort |
|----|-------|--------|
| HIGH-1 | Add `visible=False` filter to `bulk_apply_analysis` | 30 min |
| HIGH-4 | Fix resume deletion ordering and partial-failure handling | 2 hours |
| MED-3 | Add URL scheme validation + SSRF protection for custom sources | 1 hour |
| MED-6 | Fix closure variable capture in `_status_cb` | 15 min |
| LOW-9 | Add file size limit on resume upload | 15 min |
| MED-1 | Move WS token out of query parameter | 2 hours |

### Next Sprint
| ID | Issue | Effort |
|----|-------|--------|
| HIGH-2 | Explicit scraper-name routing instead of heuristic source detection | 3 hours |
| HIGH-3 | Document single-process constraint; add guard | 1 hour |
| HIGH-5 | Push TTL filter to SQL query | 1 hour |
| HIGH-6 | Switch to AsyncOpenAI client | 2 hours |
| MED-2 | Use `ignore_duplicates=True` on queue upsert | 30 min |
| MED-4 | Use `.ilike()` for company name filtering | 30 min |
| MED-5 | Add lock to `start_user_scrapers` | 1 hour |

### Backlog
| ID | Issue | Effort |
|----|-------|--------|
| LOW-1 | Decompose `main.py` into route files | 1 day |
| LOW-2 | Standardize `retry_supabase` usage | 3 hours |
| LOW-3 | Fix deprecated `datetime.utcnow()` | 15 min |
| LOW-4 | Rewrite `.env.example` | 30 min |
| LOW-5 | Clarify concurrency config vs. sequential processing | 30 min |
| LOW-6 | Reuse Playwright browser instances | 3 hours |
| LOW-7 | Remove `verify=False` from curl_cffi sessions | 30 min |
| LOW-8 | Per-user log isolation | 2 hours |
| MED-7 | Parameterize source in job analysis lookup | 30 min |
| MED-8 | Singleton DeepSeek client | 1 hour |

---

## Appendix: File Reference Map

| File | Primary Concerns Noted |
|------|----------------------|
| `backend/app/core/auth.py` | CRIT-1 (JWT bypass) |
| `backend/app/main.py` | CRIT-2 (CORS), HIGH-2 (routing), HIGH-3 (in-memory state), HIGH-4 (resume delete), MED-5 (scrapers_started race), MED-6 (closure), MED-7 (hard-coded source), LOW-1 (file size), LOW-8 (log isolation) |
| `backend/app/api/websocket.py` | MED-1 (token in URL) |
| `backend/app/services/supabase_jobs.py` | HIGH-1 (bulk update scope), HIGH-5 (Python-side TTL filter), MED-4 (company filter) |
| `backend/app/services/job_queue.py` | MED-2 (TOCTOU race) |
| `backend/app/services/job_analyzer.py` | HIGH-6 (sync OpenAI client), MED-8 (client per call) |
| `backend/app/services/scraper_custom.py` | MED-3 (SSRF), MED-8 (client per call), LOW-6 (Playwright reuse) |
| `backend/app/services/jobright_session.py` | LOW-7 (verify=False) |
| `backend/app/services/scraper_jobright.py` | HIGH-3 (global state), LOW-7 (verify=False) |
| `backend/app/core/config.py` | LOW-5 (misleading concurrency config) |
| `backend/app/core/supabase_retry.py` | LOW-2 (inconsistent usage) |
| `backend/app/models/job.py` | LOW-3 (utcnow deprecated) |
| `backend/.env.example` | CRIT-3 (stale), LOW-4 (missing vars) |
| `backend/.env` | CRIT-3 (committed secrets) |
| `resume_service/analyzer.py` | HIGH-6 (sync OpenAI client) |
