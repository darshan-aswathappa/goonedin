# ISSUE-002: Reduce LinkedIn Scraper MAX_PAGES from 4 to 2

**Type:** Performance / Quick Win
**Priority:** High
**Assignee:** Backend Engineer
**Labels:** `performance`, `scraper`, `rate-limiting`, `quick-win`

---

## Problem Statement

The LinkedIn scraper (`scraper_linkedin.py`) is configured to paginate up to **4 pages** per search keyword per scrape cycle. With a page size of 25 jobs, this means up to **100 jobs fetched per keyword per 90-second cycle**.

The scraper uses `f_TPR=r1800` (jobs posted in the last 30 minutes) as a freshness filter. In any given 90-second window, LinkedIn will realistically publish **a handful of new jobs** for any single keyword. Fetching 100 results to find ~2 new ones is a ~98% waste.

**The result:** 4× more LinkedIn HTTP requests than necessary, increasing rate-limit exposure, proxy costs, and cycle latency with no corresponding increase in data quality.

---

## Proposed Solution

Change the constant `MAX_PAGES` from `4` to `2` in `backend/app/services/scraper_linkedin.py`.

This is a one-line change with no schema changes, no API changes, and no frontend impact.

---

## Product Requirements (PRD)

### Goals
- Reduce LinkedIn HTTP requests by ~50% immediately
- Maintain full coverage of freshly-posted jobs (no data loss in practice)
- Reduce per-cycle latency (fewer sequential HTTP calls per keyword)
- Reduce rate-limit / IP-ban surface area

### Non-Goals
- Changing the scrape interval (separate concern)
- Adding seen-cursor early-stop logic (a follow-up optimization)
- Touching any other scraper (Indeed, MathWorks, GitHub)

### User Stories

**As the platform**, I want to make fewer LinkedIn requests without missing new job postings, so we reduce rate-limit risk and proxy spend while maintaining data freshness for users.

### Acceptance Criteria
- [ ] `MAX_PAGES` constant in `scraper_linkedin.py` is set to `2`
- [ ] Scraper still paginates correctly (fetches page 0 and page 1, stops at 2)
- [ ] Early-stop logic (empty page → break) still works correctly — no regression
- [ ] No new jobs missed compared to current behavior (validated by observation: pages 3–4 consistently return 0 cards under a 30-min freshness filter at 90s cadence)
- [ ] Log output updated: `"up to {MAX_PAGES} pages"` reflects the new value automatically

---

## Technical Scope

### Backend Engineer

**File:** `backend/app/services/scraper_linkedin.py`

**Change:**
```
Line 81: MAX_PAGES = 4   →   MAX_PAGES = 2
```

**Why 2 and not 1:**
- Page 1 (start=0) returns the 25 most recent jobs sorted by date
- Page 2 (start=25) provides a safety buffer in case a burst of postings hit simultaneously
- Pages 3 and 4 under a 30-minute freshness filter at 90-second cadence are statistically empty and wasteful

**Validation steps:**
1. Deploy the change
2. Monitor scraper logs for one full hour: compare `pages_fetched` and job yield per cycle
3. Confirm page 2 (start=25) is returning 0 cards consistently → candidate to cut to `MAX_PAGES = 1` in a follow-up

---

## Impact Analysis

| Metric | Before | After | Delta |
|---|---|---|---|
| HTTP requests per keyword per cycle | up to 4 | up to 2 | −50% |
| HTTP requests per cycle (10 keywords, 2 loops) | up to 80 | up to 40 | −40 requests |
| HTTP requests per user per 24h (10 keywords) | ~76,800 | ~38,400 | −38,400 |
| Cycle latency (sequential pages w/ retries) | higher | lower | improved |
| Job coverage | same | same | no change |

---

## Risks & Considerations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missing jobs if a keyword gets a burst of 50+ postings in 90s | Very Low | 30-min freshness filter + 90s cadence makes this astronomically unlikely |
| Pages 1–2 start returning empty unexpectedly (LinkedIn changes) | Low | Existing early-stop logic (`if not job_cards: break`) handles this gracefully |
| Regression in other scrapers | None | Change is isolated to `scraper_linkedin.py` constant |

---

## Follow-up Issues (out of scope here)
- **ISSUE-003 (proposed):** Seen-cursor early-stop — track newest job ID per keyword and stop pagination when a previously-seen ID is encountered
- **ISSUE-004 (proposed):** Evaluate cutting to `MAX_PAGES = 1` based on page-2 yield metrics gathered after this change

---

## Dependencies
- None

## Estimated Effort
- Backend: XS (< 30 min including validation)
