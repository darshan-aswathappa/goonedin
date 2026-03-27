# HireFeed Analytics — Project Overview

> Reference document for engineers onboarding to the analytics module. Covers every component, the full data flow, the Supabase schema, and the design system. Written against the codebase as of March 2026.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Directory Structure](#3-directory-structure)
4. [Pages and Layout](#4-pages-and-layout)
5. [Components Reference](#5-components-reference)
6. [Library Functions](#6-library-functions)
7. [API Routes](#7-api-routes)
8. [Supabase Schema](#8-supabase-schema)
9. [Design System](#9-design-system)
10. [TypeScript Types](#10-typescript-types)
11. [State Management and Events](#11-state-management-and-events)
12. [Testing](#12-testing)
13. [Dependencies](#13-dependencies)
14. [Running Locally](#14-running-locally)

---

## 1. Project Overview

HireFeed Analytics is a server-side-rendered job market intelligence dashboard. It aggregates job postings from multiple sources (LinkedIn, GitHub, MathWorks, custom ATS integrations), processes each job through a DeepSeek AI pipeline to extract structured signals (skills, salary, seniority, visa sponsorship, years of experience), and presents the aggregated data across 15+ interactive visualizations in five dashboard tabs.

**Target users.** Data-savvy job seekers and recruiters who want dense, actionable job market intelligence. The interface assumes comfort with information-dense screens. Users scan for trends and outliers, not casual browsing.

**Aesthetic philosophy.** The UI is modeled on a Bloomberg Terminal: stark black backgrounds, amber/orange as the sole signal color, JetBrains Mono throughout, 2px border radius maximum, no gradients, no soft shadows, dark mode only. The design goal is *command and authority* — the user has information others do not. SaaS dashboard conventions (cards with colored icons, rounded corners, consumer-friendly whitespace) are explicitly rejected.

**Tech stack.** Next.js 15, React 19, Supabase (Postgres + RPC), Recharts, TailwindCSS v4, TypeScript 5.

---

## 2. Architecture Overview

### Data Flow

```
Supabase Postgres (jobs, job_analysis_cache, custom_sources)
        |
        | RPC calls (analytics_* stored procedures)
        v
Next.js API Routes  (/api/analytics/*)
        |
        | 15 parallel fetch() calls via Promise.all()
        v
page.tsx  (SSR, force-dynamic)
        |
        | props (15 typed data shapes)
        v
DashboardTabs
        |
        |-- activeTab routing
        |       |-- "market"    → JobVolumeChart, WeekdayChart, TimeDistributionChart,
        |       |                  PostingHeatmap, IntelPanel, SourceDistribution
        |       |-- "skills"    → SkillsFrequency, SoftSkillsPanel, GoodToHavePanel,
        |       |                  SkillCooccurrence, SkillMomentumTable
        |       |-- "companies" → CompanyLeaderboard, HiringVelocityChart
        |       |-- "pipeline"  → QueueHealth, SalaryChart, SeniorityChart,
        |       |                  ExperienceDistribution, JobFunctionsChart, VisaStats
        |       |-- "geo"       → LocationChart, SalaryByLocationChart
        |
        v
SafePanel > ChartErrorBoundary > Chart component
```

### SSR Strategy

`page.tsx` exports `dynamic = "force-dynamic"`, which disables Next.js static generation and incremental static regeneration for the route. Every request hits the API routes fresh. This is intentional: job market data changes continuously, and stale cached pages would mislead users. Each API route also exports `dynamic = "force-dynamic"` for the same reason.

Data fetching in `page.tsx` uses `Promise.all()` over 15 concurrent `fetch()` calls to the internal API routes. All 15 requests run in parallel; the page renders only after all resolve (or fail gracefully with null).

### AI Panel Data Flow

The `AICompanion` component communicates with a separate backend via the `useKnowledgeBase` hook (SWR + streaming). Query plans surface as collapsible "thinking" blocks showing SQL/VECTOR/HYBRID execution details. This path is independent of the 15 analytics API routes.

---

## 3. Directory Structure

```
analytics/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── analytics/
│   │   │       ├── companies/route.ts       # Top companies + hourly distribution
│   │   │       ├── cooccurrence/route.ts    # Skill co-occurrence pairs
│   │   │       ├── experience/route.ts      # Years-of-experience demand distribution
│   │   │       ├── hiring-velocity/route.ts # Per-company hiring trends over time
│   │   │       ├── hourly-by-day/route.ts   # 24-hour posting distribution
│   │   │       ├── locations/route.ts       # City-level geographic distribution
│   │   │       ├── overview/route.ts        # Top-level KPI aggregates
│   │   │       ├── queue/route.ts           # AI pipeline health stats
│   │   │       ├── salary-by-location/route.ts  # Median salary per city
│   │   │       ├── salary/route.ts          # Salary range bucket distribution
│   │   │       ├── seniority/route.ts       # Seniority + title + job function data
│   │   │       ├── skill-momentum/route.ts  # Top skills with daily trend sparklines
│   │   │       ├── skills/route.ts          # Tech, soft, good-to-have skills + co-occurrence
│   │   │       ├── sources/route.ts         # Job source distribution
│   │   │       ├── timeline/route.ts        # Daily job volume time series
│   │   │       ├── visa/route.ts            # Visa sponsorship buckets
│   │   │       └── weekday/route.ts         # Day-of-week posting distribution
│   │   ├── globals.css                      # CSS variables, layout classes, animations
│   │   ├── layout.tsx                       # Root layout, font, providers
│   │   └── page.tsx                         # Main SSR page, Promise.all data fetch
│   │
│   ├── components/
│   │   ├── __tests__/                       # Jest + RTL tests (see Section 12)
│   │   │
│   │   │-- Core containers & layout
│   │   ├── DashboardTabs.tsx                # Tab router, KPI strip, StatusBar
│   │   ├── TabNav.tsx                       # Keyboard-driven tab navigation
│   │   ├── TerminalHeader.tsx               # Sticky header, live clock, ticker
│   │   ├── BootSequence.tsx                 # One-time terminal boot animation
│   │   ├── AutoRefresh.tsx                  # 60-second page refresh trigger
│   │   ├── ScanlineOverlay.tsx              # CRT scanline CSS effect
│   │   │
│   │   │-- Panel wrappers
│   │   ├── SafePanel.tsx                    # Error boundary + panel styling wrapper
│   │   ├── ChartErrorBoundary.tsx           # React error boundary for chart failures
│   │   ├── EmptyPanel.tsx                   # Loading/empty state placeholder
│   │   ├── PanelHint.tsx                    # Inline contextual help text
│   │   ├── SectionGuide.tsx                 # Section dividers with labels
│   │   │
│   │   │-- UI controls
│   │   ├── CommandPalette.tsx               # Cmd+K search palette
│   │   ├── CommandPaletteProvider.tsx       # Global context provider for palette
│   │   ├── AIPanel.tsx                      # Slide-in AI chat wrapper
│   │   ├── AICompanion.tsx                  # AI chat interface with streaming + markdown
│   │   ├── MetricCard.tsx                   # KPI display with optional sparkline
│   │   ├── ChartTooltip.tsx                 # Reusable styled Recharts tooltip
│   │   │
│   │   │-- Market tab charts
│   │   ├── JobVolumeChart.tsx               # Daily postings line chart (7/14/30/90d)
│   │   ├── WeekdayChart.tsx                 # Sun–Sat posting distribution bar chart
│   │   ├── TimeDistributionChart.tsx        # 24-hour posting distribution bar chart
│   │   ├── PostingHeatmap.tsx               # Hour × day activity matrix
│   │   ├── IntelPanel.tsx                   # Key market metrics text summary
│   │   ├── SourceDistribution.tsx           # Job source breakdown bar chart
│   │   │
│   │   │-- Skills tab charts
│   │   ├── SkillsFrequency.tsx              # Top tech skills ranked bars
│   │   ├── SoftSkillsPanel.tsx              # Soft skills ranked list
│   │   ├── GoodToHavePanel.tsx              # Nice-to-have skills ranked list
│   │   ├── SkillCooccurrence.tsx            # Skills co-occurrence matrix
│   │   ├── SkillMomentumTable.tsx           # Top 10 skills with daily sparklines
│   │   │
│   │   │-- Companies tab charts
│   │   ├── CompanyLeaderboard.tsx           # Tier-colored ranked company bars
│   │   ├── HiringVelocityChart.tsx          # Multi-line hiring trend per company
│   │   │
│   │   │-- Pipeline tab charts
│   │   ├── QueueHealth.tsx                  # AI pipeline status panel
│   │   ├── SalaryChart.tsx                  # Salary range bucket distribution
│   │   ├── SeniorityChart.tsx               # Seniority level distribution bar
│   │   ├── ExperienceDistribution.tsx       # Years-of-experience demand bar
│   │   ├── JobFunctionsChart.tsx            # Job category distribution bar
│   │   ├── VisaStats.tsx                    # Visa sponsorship pie/donut
│   │   │
│   │   │-- Geo tab charts
│   │   ├── LocationChart.tsx                # react-simple-maps bubble map
│   │   └── SalaryByLocationChart.tsx        # Median salary per city bar chart
│   │
│   ├── hooks/
│   │   └── useKnowledgeBase.ts              # SWR + SSE hook for AI companion
│   │
│   ├── lib/
│   │   ├── analytics.ts                     # All server-side aggregation functions
│   │   ├── supabase-server.ts               # Stateless server-only Supabase client
│   │   ├── tokens.ts                        # Design system constants (colors, chart config)
│   │   ├── blocked-companies.ts             # Blocklist for company name normalization
│   │   └── city-coordinates.ts             # Lat/lng map for LocationChart bubbles
│   │
│   └── types/
│       ├── knowledge-base.ts                # ChatMessage, StreamEvent, QueryPlan, Command
│       └── react-simple-maps.d.ts           # Type shim for react-simple-maps
│
├── jest.config.ts                           # Jest config with 85% coverage thresholds
├── next.config.ts                           # Next.js config
├── package.json
└── tsconfig.json
```

---

## 4. Pages and Layout

### `src/app/layout.tsx`

Root Next.js App Router layout. Responsibilities:

- Loads `JetBrains_Mono` from Google Fonts and applies it as `--font-jetbrains-mono` CSS variable.
- Wraps the entire app in `CommandPaletteProvider` so `CommandPalette` is globally accessible.
- Renders `AIPanel` outside the page content tree so the slide-in panel exists at root level.
- Sets page metadata: `title = "HireFeed Analytics"`, `description = "Real-time job market intelligence dashboard"`.

### `src/app/page.tsx`

Main dashboard page. Runs exclusively on the server (`dynamic = "force-dynamic"`).

**Data fetching.** Fires 15 `fetch()` calls in a single `Promise.all()`:

```
/api/analytics/overview
/api/analytics/companies
/api/analytics/skills
/api/analytics/timeline
/api/analytics/locations
/api/analytics/sources
/api/analytics/visa
/api/analytics/salary
/api/analytics/seniority
/api/analytics/weekday
/api/analytics/queue
/api/analytics/skill-momentum
/api/analytics/experience
/api/analytics/salary-by-location
/api/analytics/hiring-velocity
```

Each call resolves to a typed shape or `null` on failure. All 15 shapes are typed inline in `page.tsx`. Failed individual fetches do not crash the page — null-safe rendering is delegated to `DashboardTabs` and `EmptyPanel`.

**Render tree:**

```
BootSequence          (full-screen boot animation, one-time)
AutoRefresh           (60-second reload trigger, no UI)
ScanlineOverlay       (fixed CRT effect, pointer-events: none)
TerminalHeader        (sticky header, clock, refresh)
DashboardTabs         (receives all 15 data shapes as props)
<footer>              (fixed bottom bar, build info)
```

---

## 5. Components Reference

### Core Containers

#### `DashboardTabs`

The primary rendering controller. Receives all 15 data shapes as nullable props and routes to the correct tab content.

| Prop | Type | Description |
|------|------|-------------|
| `overview` | `Overview \| null` | KPI aggregates |
| `companies` | `Companies \| null` | Company leaderboard data |
| `skills` | `Skills \| null` | Tech/soft/good-to-have/cooccurrence |
| `timeline` | `Timeline \| null` | Daily job volume |
| `locations` | `Locations \| null` | City distribution |
| `visa` | `Visa \| null` | Sponsorship buckets |
| `salary` | `Salary \| null` | Salary range data |
| `seniority` | `Seniority \| null` | Level distribution + job functions |
| `weekday` | `Weekday \| null` | Day-of-week distribution |
| `queue` | `Queue \| null` | Pipeline health stats |
| `skillMomentum` | `SkillMomentum \| null` | Skill trend sparklines |
| `experience` | `Experience \| null` | Years-of-experience distribution |
| `salaryByLocation` | `SalaryByLocation \| null` | Per-city salary medians |
| `hiringVelocity` | `HiringVelocity \| null` | Per-company time series |
| `sources` | `Sources \| null` | Source distribution |

**Key behaviors:**

- `activeTab` state controls which tab renders. Initial value: `"market"`.
- `visitedTabs` is a `Set<string>`. On first visit to a tab it is added to the set. Tabs in the set stay mounted (hidden via `display: none`) on subsequent tab switches. This prevents `LocationChart` from re-fetching the world geo.json on every tab switch.
- Renders a KPI metric card strip above the tab content: Unique Postings, AI Analyzed, Companies, Jobs/Day, Salary Listed.
- `StatusBar` at the bottom shows current time, data latency, and keyboard hints.
- Listens for `dashboard:switchtab` custom DOM events to allow external components (CommandPalette, AICompanion) to drive navigation without prop drilling.

**Tab definitions:**

| Key | Label | Keyboard shortcut |
|-----|-------|------------------|
| `market` | MARKET | 1 |
| `skills` | SKILLS | 2 |
| `companies` | COMPANIES | 3 |
| `pipeline` | PIPELINE | 4 |
| `geo` | GEO | 5 |

#### `TabNav`

Renders the tab strip. Keyboard-driven.

| Prop | Type | Description |
|------|------|-------------|
| `active` | `string` | Currently active tab key |
| `onChange` | `(tab: string) => void` | Tab switch callback |

- Digits 1–5 activate the corresponding tab directly.
- Arrow left/right cycle through tabs.
- Displays terminal-style labels: `[1] MARKET`, `[2] SKILLS`, etc.

#### `TerminalHeader`

Sticky header bar. Always visible regardless of active tab.

| Prop | Type | Description |
|------|------|-------------|
| `lastUpdated` | `string \| undefined` | ISO timestamp of last data fetch |
| `onRefresh` | `() => void \| undefined` | Callback for REFRESH button |

- Left region: "HIREFEED" brand mark + "MARKET INTELLIGENCE TERMINAL" subtitle.
- Center region: blinking LIVE dot, last updated timestamp.
- Right region: `⌘K` keyboard hint, REFRESH button, digital clock (HH:MM:SS), date.
- Below the main bar: a horizontally scrolling ticker strip with sampled market metrics.

#### `BootSequence`

One-time terminal boot animation shown on first visit. Checks `localStorage` for `"hirefeed-boot-seen"`. If present, renders nothing. Otherwise renders a full-screen overlay (z-index 10000) with sequenced line reveals (delay range 0–4200ms), a blinking cursor, a skip button, and press-any-key dismissal. Sets the localStorage key on dismiss.

#### `AutoRefresh`

No visible UI. Triggers a full page reload every 60 seconds to pull fresh data from the server.

#### `ScanlineOverlay`

Fixed-position overlay (z-index 9999, `pointer-events: none`) that renders a repeating linear gradient simulating CRT scanlines: `transparent 2px` alternating with `rgba(0,0,0,0.03) 2px`.

---

### Panel Wrappers

#### `SafePanel`

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Panel header label |
| `children` | `ReactNode` | Chart or content |

Thin wrapper that delegates to `ChartErrorBoundary`. Provides consistent panel chrome (`.panel`, `.panel-header` classes) around any chart. Use this instead of `ChartErrorBoundary` directly.

#### `ChartErrorBoundary`

React class component error boundary. Catches render errors from child chart components and renders a `"RENDER ERROR"` message with `error.message` in the panel space. Prevents a single chart failure from unmounting the rest of the dashboard.

#### `EmptyPanel`

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Panel title |
| `message` | `string \| undefined` | Optional status message |
| `suggestion` | `string \| undefined` | Optional help text |

Renders when the parent receives null data. Shows animated pulse dots labeled `"WAITING"` and optional terminal-style suggestion text.

#### `PanelHint`

Inline contextual help text rendered beneath a chart or section. Used for dataset footnotes and methodology notes.

#### `SectionGuide`

Visual section divider with a label. Used between chart groups within a tab to signal topic transitions.

---

### UI Controls

#### `MetricCard`

KPI display component used in the five-card strip at the top of `DashboardTabs`.

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Metric name |
| `value` | `string \| number` | Primary displayed value |
| `subLabel` | `string` | Secondary descriptor |
| `accent` | `"teal" \| "amber" \| "green" \| "red" \| "blue"` | Bottom accent bar color |
| `sparklineData` | `number[] \| undefined` | Optional mini sparkline data |
| `delta` | `string \| undefined` | Change indicator (e.g., "+12%") |
| `deltaPositive` | `boolean \| undefined` | Controls delta color (green vs red) |
| `delay` | `number` | Staggered entrance animation delay (ms) |
| `rank` | `number \| undefined` | Badge in top-left corner |
| `updatedAt` | `string \| undefined` | Last-updated timestamp |

- Sparkline renders as an 80×36px `LineChart` from Recharts when `sparklineData` is provided.
- Delta is displayed with a `▲` or `▼` indicator based on `deltaPositive`.
- Entrance animation staggers across the five cards via `delay`.

#### `CommandPalette`

Global `Cmd+K` command palette. Rendered once at root via `CommandPaletteProvider`.

- Opens on `commandpalette:open` DOM custom event or keyboard shortcut.
- Search filters commands by `label` and `description`.
- Two command groups:
  - `ACTION`: "Ask AI" — fires `ai:toggle` event.
  - `NAVIGATE`: one entry per tab section plus "scroll to top" — fires `dashboard:switchtab` or scrolls.
- Keyboard navigation: `↑`/`↓` to move selection, `Enter` to execute, `Esc` to close.

#### `AIPanel`

Slide-in panel from the right edge. Contains `AICompanion`. Has a backdrop overlay. Closes on `Esc` key or backdrop click. Listens for `ai:toggle` DOM event to open/close.

#### `AICompanion`

| Prop | Type | Description |
|------|------|-------------|
| `onClose` | `() => void` | Close callback |
| `isOpen` | `boolean` | Visibility state |

Full AI chat interface backed by `useKnowledgeBase`.

- Renders markdown responses: `**bold**`, `*italic*`, `` `code` `` inline; tables and bullet lists as block elements.
- Collapsible "thinking" blocks show the query execution plan (`SQL`/`VECTOR`/`HYBRID`) including elapsed milliseconds and row counts.
- Suggested prompt chips when the chat is empty.
- Supports streaming responses via Server-Sent Events.

#### `ChartTooltip`

Reusable Recharts `content` prop component. Applies consistent styling: `var(--bg-panel)` background, `var(--border-bright)` border, JetBrains Mono 11px, 7px/10px padding.

---

### Chart Components

#### Market Tab

| Component | Chart Type | Key Props | Notes |
|-----------|-----------|-----------|-------|
| `JobVolumeChart` | Line | `data: { day, count }[]` | Range filter buttons: 7 / 14 / 30 / 90 days |
| `WeekdayChart` | Bar | `data, peakDay?` | Sun–Sat distribution; highlights peak day |
| `TimeDistributionChart` | Bar | `fallbackData` | 24-hour distribution; weekday filter toggles |
| `PostingHeatmap` | 2D matrix | — | Hour (0–23) × weekday activity matrix |
| `IntelPanel` | Text | `topCompany, topSkill, topCity, sponsorshipRate, avgJobsPerDay, completionRate, totalJobs` | No chart; summarizes key signals as text |
| `SourceDistribution` | Bar | `sources: { source, count, color }[]` | LinkedIn, GitHub, MathWorks, custom ATS sources |

#### Skills Tab

| Component | Chart Type | Key Props | Notes |
|-----------|-----------|-----------|-------|
| `SkillsFrequency` | Ranked list | `data: { keyword, count }[]` | Animated bar fill; top technical keywords from AI analysis |
| `SoftSkillsPanel` | Ranked list | `data: { skill, count }[]` | Soft skill keywords from qualifications field |
| `GoodToHavePanel` | Ranked list | `data: { keyword, count }[]` | Nice-to-have keywords |
| `SkillCooccurrence` | Matrix | `data: { a, b, count }[]` | Skills frequently requested together in the same posting |
| `SkillMomentumTable` | Table + sparklines | `skills, dailyJobs, dateRange` | Top 10 skills; each row has a 7-day mini sparkline; 2-column responsive layout |

#### Companies Tab

| Component | Chart Type | Key Props | Notes |
|-----------|-----------|-----------|-------|
| `CompanyLeaderboard` | Ranked list | `data: { company, count }[]` | Tier-colored bars cycling `TIER_COLORS`; rank badge per entry |
| `HiringVelocityChart` | Multi-line | `companies, data` | One line per company; shows hiring trend over time |

#### Pipeline Tab

| Component | Chart Type | Key Props | Notes |
|-----------|-----------|-----------|-------|
| `QueueHealth` | Status panel | `completed, failed, pending, total, successRate, withVisa, withSalary, analyzedCount` | Colored status indicators; no chart |
| `SalaryChart` | Bar | `buckets, listedRate, listedCount, medianEstimate` | 9 salary range buckets; shows listing rate and median estimate |
| `SeniorityChart` | Bar | `data: { level, count, color }[]` | 7 seniority levels with level-specific colors |
| `ExperienceDistribution` | Bar | `distribution, matched, total, matchRate` | Years-of-experience demand; shows match rate |
| `JobFunctionsChart` | Bar | `data: { function, count, color }[]` | 9 job categories (FE/BE/ML/DevOps etc.) |
| `VisaStats` | Pie/Donut | `data, sponsorshipRate, total` | 4 buckets: Sponsor / No Sponsor / Citizen+GC / Unknown |

#### Geo Tab

| Component | Chart Type | Key Props | Notes |
|-----------|-----------|-----------|-------|
| `LocationChart` | Bubble map | `data: { city, count }[]` | `react-simple-maps`; bubble size proportional to count; coordinates from `city-coordinates.ts` |
| `SalaryByLocationChart` | Bar | `cities: { city, median, count }[]` | Median annual salary per city; sorted descending |

---

## 6. Library Functions

All functions are in `src/lib/analytics.ts`. All run server-side only (called from API routes).

### Core Aggregation Functions

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `deduplicateJobs<T>` | `T[]` (requires `external_id`) | `T[]` | Removes duplicates keyed on `external_id`. When two records share the same key, the one with the earlier date is retained. |
| `resolveJobDate` | `{ posted_at?, created_at? }` | `string \| null` | Returns a valid ISO date string. Validates that `posted_at` falls within a 2-year to 1-week window (filters out future dates and very old records). Falls back to `created_at` if `posted_at` is invalid. |
| `aggregateSkills` | `{ analysis }[]` | `{ keyword, count }[]` | Parses AI analysis JSONB to extract technical keywords. Returns sorted by count descending. |
| `aggregateSoftSkills` | `{ analysis }[]` | `{ skill, count }[]` | Extracts soft skills from the qualifications field of AI analysis. |
| `aggregateGoodToHave` | `{ analysis }[]` | `{ keyword, count }[]` | Extracts nice-to-have skill keywords from AI analysis. |
| `aggregateSalary` | `{ salary?, external_id }[]` | `{ buckets, listedRate, listedCount, medianEstimate }` | Parses raw salary strings into 9 range buckets. Computes listing rate (% of jobs with a salary) and median estimate. |
| `aggregateSeniority` | `{ title? }[]` | `{ level, count, color }[]` | Applies `extractSeniority()` to each job title. Returns distribution across 7 levels. |
| `aggregateWeekday` | `{ posted_at?, created_at? }[]` | `{ day, count }[]` | Groups jobs by day of week (Sunday through Saturday) using `resolveJobDate`. |
| `aggregateTitleKeywords` | `{ title? }[]` | `{ word, count }[]` | Tokenizes job titles, strips common stopwords, and returns top keywords by frequency. |
| `aggregateVisa` | `{ visa?, visa_status? }[]` | `VisaBucket[]` | Groups visa fields into 4 buckets (see below). |
| `aggregateLocations` | `{ location? }[]` | `{ city, count }[]` | Normalizes city names via `normalizeLocation()`, counts per city, returns top 15. |
| `aggregateJobFunctions` | `{ title? }[]` | `{ function, count, color }[]` | Classifies job titles into 9 function categories (see below). |
| `fillDateRange` | `{ day, count }[]` | `{ day, count }[]` | Fills missing calendar dates within a 30-day window with `count: 0` to prevent gaps in time series charts. |
| `parseAnalysis` | `unknown` | `JobAnalysis \| null` | Safe parser that coerces unknown Supabase JSONB to the `JobAnalysis` type or returns null. |

### `extractSeniority`

Applies regex patterns against a job title string. Returns one of 7 levels:

| Level | Detection patterns (examples) |
|-------|-------------------------------|
| `Intern` | "intern", "internship", "co-op" |
| `Junior` | "junior", "jr.", "entry" |
| `Mid-Level` | "mid", "ii", "intermediate" |
| `Senior` | "senior", "sr.", "iii" |
| `Staff/Principal` | "staff", "principal" |
| `Lead/Manager` | "lead", "manager", "tech lead" |
| `Director+` | "director", "vp", "head of", "chief" |

Seniority level colors used for chart rendering:

| Level | Color |
|-------|-------|
| Intern | `#64748b` |
| Junior | `#3b82f6` |
| Mid-Level | `#00d4aa` |
| Senior | `#4ade80` |
| Staff/Principal | `#a855f7` |
| Lead/Manager | `#f59e0b` |
| Director+ | `#ef4444` |

### `parseSalaryToAnnual`

Converts raw salary strings to a normalized annual integer. Handles:

| Format | Example | Conversion |
|--------|---------|------------|
| Annual range | `$120K-$150K` | Average of range; `K` suffix multiplied by 1,000 |
| Hourly range | `$45-$55/hr` | Average of range × 2,080 (40 hrs × 52 wks) |
| Monthly range | `$8K-$10K/mo` | Average of range × 12 |
| Mixed formats | Various | Parsed left-to-right; first numeric value used as fallback |

Noise filters:
- Annual values below $20,000 are discarded.
- Hourly values below $10 are discarded.
- Monthly values outside $500–$50,000 are discarded.

### `aggregateVisa`

Groups raw visa strings into 4 labeled buckets:

| Bucket | Included values |
|--------|----------------|
| Sponsor | Affirmative sponsorship strings |
| No Sponsor | Explicit refusal strings |
| Citizen+GC | Citizen or permanent resident requirement strings |
| Unknown | Null, empty, or unrecognized strings |

### `aggregateJobFunctions`

Classifies job titles into 9 categories using keyword matching:

| Category | Example title keywords |
|----------|----------------------|
| Full Stack | "full stack", "fullstack" |
| Frontend | "frontend", "front-end", "ui engineer", "react" |
| Backend | "backend", "back-end", "api engineer", "java" |
| Data Eng | "data engineer", "etl", "pipeline" |
| ML/AI | "machine learning", "ml engineer", "ai", "deep learning" |
| DevOps/SRE | "devops", "sre", "platform", "infra", "cloud" |
| Mobile | "ios", "android", "mobile", "react native" |
| Security | "security", "appsec", "infosec" |
| Embedded | "embedded", "firmware", "fpga" |

### `normalizeLocation`

Maps city name aliases to canonical forms. Example mappings:

| Input | Canonical |
|-------|----------|
| "NYC", "New York City", "New York" | `"New York, NY"` |
| "SF", "San Francisco" | `"San Francisco, CA"` |
| "LA", "Los Angeles" | `"Los Angeles, CA"` |

---

## 7. API Routes

All routes are in `src/app/api/analytics/`. All export `dynamic = "force-dynamic"`. All use `createServerClient()` from `supabase-server.ts`. All return `NextResponse.json(result)` on success or HTTP 500 with an error message on failure.

| Route | RPC Function(s) Called | Response Shape |
|-------|----------------------|----------------|
| `/api/analytics/overview` | `analytics_overview` | `{ total, analyzed, completionRate, uniqueCompanies, avgJobsPerDay, jobs30d }` |
| `/api/analytics/companies` | `analytics_companies` | `{ topCompanies: { company, count }[], hourlyDistribution }` |
| `/api/analytics/skills` | `analytics_tech_skills`, `analytics_good_to_have`, `analytics_qualifications`, `analytics_skill_cooccurrence` | `{ techSkills, softSkills, goodToHave, cooccurrencePairs }` |
| `/api/analytics/timeline` | `analytics_timeline` | `{ timeline: { day: string, count: number }[] }` |
| `/api/analytics/locations` | `analytics_locations` | `{ locations: { city, count }[] }` |
| `/api/analytics/sources` | `analytics_sources` | `{ sources: { source, count, color }[] }` |
| `/api/analytics/visa` | `analytics_visa` | `{ visa: VisaBucket[], total: number, sponsorshipRate: number }` |
| `/api/analytics/salary` | `analytics_salary_strings`, `analytics_overview` | `{ buckets, listedRate, listedCount, medianEstimate }` |
| `/api/analytics/seniority` | `analytics_seniority`, `analytics_title_keywords`, `analytics_job_functions` | `{ seniority, titleKeywords, jobFunctions }` |
| `/api/analytics/weekday` | `analytics_weekday` | `{ weekday: { day, count }[], peakDay: string }` |
| `/api/analytics/queue` | `analytics_queue_health` | `{ completed, failed, pending, total, successRate, withVisa, withSalary, analyzedCount }` |
| `/api/analytics/skill-momentum` | `analytics_skill_momentum` | `{ skills: string[], dailyJobs: Record<string, number[]>, dateRange: string[] }` |
| `/api/analytics/experience` | `analytics_experience` | `{ distribution: { range, count }[], matched: number, total: number, matchRate: number }` |
| `/api/analytics/salary-by-location` | `analytics_salary_by_location` | `{ cities: { city, median, count }[] }` |
| `/api/analytics/hiring-velocity` | `analytics_hiring_velocity` | `{ companies: string[], data: { day, [company]: number }[] }` |

The `/api/analytics/salary` route makes two RPC calls and passes the salary strings through `aggregateSalary()` from `analytics.ts` before responding, since salary parsing logic lives in TypeScript rather than SQL.

---

## 8. Supabase Schema

### Tables (Inferred from Analytics Code)

#### `jobs` (or `scraped_jobs`)

Primary table containing scraped job postings.

| Column | Type | Notes |
|--------|------|-------|
| `external_id` | `TEXT` | Primary key. Used for deduplication across all aggregation functions. |
| `title` | `TEXT` | Job title. Input to `extractSeniority()` and `aggregateJobFunctions()`. |
| `company` | `TEXT` | Company name. Filtered against `blocked-companies.ts`. |
| `location` | `TEXT` | Raw location string. Normalized by `normalizeLocation()`. |
| `salary` | `TEXT` | Raw salary string (e.g., "$120K-$150K", "$45/hr"). Parsed by `parseSalaryToAnnual()`. |
| `posted_at` | `TIMESTAMPTZ` | Original posting date. Validated: must be within past 2 years and not in future within 1 week. |
| `created_at` | `TIMESTAMPTZ` | Record insertion timestamp. Fallback date when `posted_at` is invalid. |
| `source` | `TEXT` | Source platform: LinkedIn, GitHub, MathWorks, or custom ATS identifier. |
| `visa_status` | `TEXT` | Raw sponsorship string. Bucketed by `aggregateVisa()`. |
| `analysis` | `JSONB` | AI-extracted structured data (skills, soft skills, good-to-have, seniority hint, experience range). |

#### `job_analysis_cache`

Caches DeepSeek AI analysis results to avoid re-processing completed jobs.

| Column | Type | Notes |
|--------|------|-------|
| `external_id` | `TEXT` | Primary key. Foreign key to `jobs.external_id`. |
| `analysis` | `JSONB` | Cached analysis result. Same structure as `jobs.analysis`. |
| `analysis_status` | `TEXT` | `"completed"`, `"failed"`, or `"pending"`. Jobs with `"completed"` are not re-enqueued. |

#### `custom_sources`

User-defined job source configurations, including ATS integrations.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | Primary key. |
| `user_id` | `UUID` | Owning user. |
| `name` | `TEXT` | Display name for the source. |
| `source_url` | `TEXT` | Scraping target URL. |
| `ats_type` | `TEXT` | `"greenhouse"` or `"other"`. Determines scraper routing. Requires migration if not present. |
| `department` | `TEXT` | Optional department filter for Greenhouse API scraping. |

> **Migration note.** The `ats_type` and `department` columns were added via `ALTER TABLE` migration. Environments without this migration fall back to DeepSeek AI parsing for all custom sources regardless of URL pattern. See memory notes for the exact SQL.

### RPC Functions

All analytics queries are encapsulated in Postgres stored procedures. API routes never issue ad-hoc SQL.

| RPC Function | Return Shape |
|-------------|-------------|
| `analytics_overview` | `{ total, uniqueCompanies, analyzed, jobs30d, avgJobsPerDay }` |
| `analytics_companies` | `{ topCompanies: { company, count }[], hourlyDistribution }` |
| `analytics_tech_skills` | `{ keyword: string, count: number }[]` |
| `analytics_good_to_have` | `{ keyword: string, count: number }[]` |
| `analytics_qualifications` | `{ qualification: string, count: number }[]` |
| `analytics_skill_cooccurrence` | `{ skill_a: string, skill_b: string, pair_count: number }[]` |
| `analytics_timeline` | `{ day: string, count: number }[]` (ISO date strings) |
| `analytics_locations` | `{ city: string, count: number }[]` |
| `analytics_sources` | `{ source: string, count: number, color: string }[]` |
| `analytics_visa` | Visa bucket rows with count and color |
| `analytics_salary_strings` | `{ salary: string, count: number }[]` (raw strings, parsed in TS) |
| `analytics_queue_health` | `{ completed, failed, pending, total, successRate, withVisa, withSalary, analyzedCount }` |
| `analytics_skill_momentum` | `{ skill: string, daily_breakdown: ... }[]` |
| `analytics_experience` | Experience range distribution rows |
| `analytics_salary_by_location` | `{ city: string, median: number, count: number }[]` |
| `analytics_hiring_velocity` | Company × time-series data |
| `analytics_weekday` | `{ day: string, count: number }[]` |
| `analytics_seniority` | `{ level: string, count: number }[]` |
| `analytics_title_keywords` | `{ word: string, count: number }[]` |
| `analytics_job_functions` | `{ function: string, count: number }[]` |

---

## 9. Design System

### Design Philosophy

The aesthetic is Bloomberg Terminal meets modern data journalism. The constraints are strict and intentional:

- Background: absolute black (`#000000`). No off-black, no dark gray as root background.
- Accent color: amber/orange (`#ff8c00`). Used for primary signal (active elements, highlighted metrics). Not used decoratively. One accent, used with discipline.
- Typography: JetBrains Mono as the sole typeface for data and UI chrome. Inter as secondary for prose in AI chat only.
- Corners: 2px maximum border radius. No rounded cards.
- Depth: no box shadows, no gradients. Depth is achieved through border colors and background layering.
- Mode: dark only. No light mode, no system preference detection.

Anti-patterns (never introduce):
- Cards with colored icon backgrounds
- Rounded corners beyond 2px
- Gradient fills
- Soft drop shadows
- Consumer SaaS whitespace patterns

### CSS Variables

Defined in `src/app/globals.css`:

#### Backgrounds and Borders

| Variable | Value | Usage |
|----------|-------|-------|
| `--bg-root` | `#000000` | Page background |
| `--bg-panel` | `#080808` | Panel and card backgrounds |
| `--bg-panel-hover` | `#0f0f0f` | Hover state for interactive panels |
| `--border` | `#1c1c1c` | Default border color |
| `--border-bright` | `#333333` | Highlighted or focused borders |

#### Signal Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--teal` | `#ff8c00` | Primary amber/orange accent (named `teal` in the codebase for historical reasons) |
| `--amber` | `#ffd700` | Warnings and secondary highlights |
| `--red` | `#ff3333` | Negative values, errors, alerts |
| `--blue` | `#00bfff` | Cyan informational color |
| `--purple` | `#cc33cc` | Magenta/purple supplementary color |

> Note: `--teal` is `#ff8c00` (amber/orange), not teal. The variable name is a historical artifact. Do not introduce an actual teal color.

#### Text

| Variable | Value | Usage |
|----------|-------|-------|
| `--text` | `#f0f0f0` | Primary text |
| `--text-dim` | `#aaaaaa` | Secondary/subdued text |
| `--muted` | `#555555` | Axis labels, placeholder text |

#### Typography

| Variable | Value |
|----------|-------|
| `--font-mono` | `"JetBrains Mono", "Fira Code", monospace` |
| `--font-sans` | `"Inter", system-ui, sans-serif` |
| `--radius` | `2px` |

#### Spacing Scale

| Variable | Value |
|----------|-------|
| `--gap-xs` | `4px` |
| `--gap-sm` | `8px` |
| `--gap-md` | `10px` |
| `--gap-lg` | `14px` |
| `--gap-xl` | `32px` |
| `--gap-2xl` | `48px` |

#### Chart Heights

| Variable | Value | Usage |
|----------|-------|-------|
| `--chart-hero` | `272px` | Primary visualization per tab (receives the most vertical space) |
| `--chart-standard` | `248px` | Secondary charts |
| `--chart-compact` | `176px` | Supporting/supplementary charts |

### Layout Classes

| Class | Behavior |
|-------|----------|
| `.panel` | Base container: `background: var(--bg-panel)`, `border: 1px solid var(--border)`, `position: relative`, `overflow: hidden` |
| `.panel-header` | Title bar: JetBrains Mono 9px, uppercase, `color: var(--teal)`, `"//"` prefix convention |
| `.kpi-grid` | 5-column grid; collapses to 3 columns at 1024px, 2 columns at 640px |
| `.chart-row--one` | Single-column layout (100% width) |
| `.chart-row--two` | Two equal columns (`1fr 1fr`) |
| `.chart-row--three` | Three equal columns (`1fr 1fr 1fr`) |
| `.chart-row--one-two` | Asymmetric: `1fr 2fr` |
| `.chart-row--two-one` | Asymmetric: `2fr 1fr` |
| `.chart-row--fixed-three` | Fixed + flexible: `300px 1fr 1fr` |

### Animations

All animations are defined in `globals.css`. All are disabled under `prefers-reduced-motion: reduce`.

| Keyframe | Effect | Used by |
|----------|--------|---------|
| `chart-enter` | `scaleY(0.85 → 1)` + opacity fade in | Chart panel mount |
| `bar-grow` | `width: 0 → var(--bar-width)`, 0.6s, `cubic-bezier(0.16, 1, 0.3, 1)` | Ranked bar lists |
| `boot-line-in` | `translateX(-4px → 0)` + opacity fade in | `BootSequence` line reveals |
| `blink-dot` | `opacity: 1 → 0`, repeating | LIVE indicator in header |
| `empty-pulse` | `opacity: 0.2 ↔ 0.8`, repeating | `EmptyPanel` waiting dots |
| `ticker-scroll` | Horizontal infinite scroll | Header ticker strip |

### Design Tokens (`src/lib/tokens.ts`)

| Constant | Value | Usage |
|----------|-------|-------|
| `TIER_COLORS` | `[teal, green, blue, purple, amber]` | Cycles every 4 items in ranked lists |
| `MOMENTUM.up` | green | Positive trend indicator |
| `MOMENTUM.down` | red | Negative trend indicator |
| `MOMENTUM.flat` | `--text-dim` | No change |
| `MOMENTUM.none` | muted | No data |
| `AXIS_TICK` | `{ fontSize: 9, fontFamily: mono, fill: muted }` | Recharts axis tick props |
| `TOOLTIP_STYLE` | `bg-panel`, `border`, mono 11px, 7px/10px padding | Recharts tooltip style object |
| `CHART_ANIM_MS` | `600` | Recharts `animationDuration` prop |
| `BAR_EASING` | `cubic-bezier(0.16, 1, 0.3, 1)` | CSS bar grow animation easing |

### Responsive Breakpoints

| Breakpoint | Changes |
|-----------|---------|
| `1024px` | KPI grid: 5 → 3 columns; `.chart-row--*` children: auto height with 240px minimum |
| `640px` | KPI grid: 3 → 2 columns; all `.chart-row--*` collapse to 1 column; chart children: 220px minimum |

---

## 10. TypeScript Types

### `src/types/knowledge-base.ts`

```typescript
type QueryPlanType = "sql" | "vector" | "hybrid" | "none"

interface QueryPlan {
  type?: QueryPlanType        // Execution strategy chosen by AI backend
  query_type?: string         // Additional qualifier
  elapsed_ms?: number         // Total query execution time
  rows_returned?: number      // Number of rows the query matched
  tables_used?: string[]      // Postgres tables accessed
  sql_query?: string          // Raw SQL if type is "sql" or "hybrid"
  sql_time_ms?: number        // SQL-only portion of elapsed time
}

interface StreamEvent {
  type: "status" | "chunk" | "done" | "error"
  message?: string            // Status message text
  text?: string               // Streamed response chunk
  session_id?: string         // SSE session identifier
  query_plan?: QueryPlan      // Populated on "done" event
  rows_returned?: number      // Row count on "done"
  error?: string              // Error detail on "error" event
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  queryPlan?: QueryPlan       // Populated after streaming completes
  isStreaming?: boolean       // True while message is still receiving chunks
}

interface Command {
  id: string
  label: string
  description?: string
  group: "NAVIGATE" | "ACTION"
  shortcut?: string           // Display hint only, not a registered keyboard handler
  action: () => void
}
```

### Inline Types in `page.tsx`

All 15 API response shapes are typed inline at the top of `page.tsx`. These types match the response shapes documented in Section 7. They are not exported — if you need them in tests or other components, extract them to `src/types/`.

### `src/types/react-simple-maps.d.ts`

Type declaration shim for `react-simple-maps@^3.0.0`, which ships without bundled TypeScript types. Provides minimum type coverage for `ComposableMap`, `Geographies`, `Geography`, `Marker`, and `ZoomableGroup` to satisfy the TypeScript compiler.

---

## 11. State Management and Events

HireFeed Analytics has no global state store (no Redux, no Zustand, no React Context for data). All dashboard data is server-fetched props passed down through the component tree. The only stateful React context is `CommandPaletteProvider`, which manages palette open/close state.

### Tab Lazy-Mounting Pattern

`DashboardTabs` maintains two pieces of state:

```typescript
const [activeTab, setActiveTab] = useState("market")
const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["market"]))
```

When a tab is first activated, its key is added to `visitedTabs`. All tabs whose key is in `visitedTabs` are rendered in the DOM but hidden via `display: none` when not active. Tabs not yet visited are not rendered at all.

This pattern preserves scroll position and prevents expensive remounts — most critically, it prevents `LocationChart` from re-fetching and re-parsing the world geography GeoJSON every time the user switches away from and back to the geo tab.

### Global Event System

Cross-component communication is handled via standard DOM `CustomEvent`s dispatched on `window`. This avoids prop drilling through the deep `layout → page → DashboardTabs → chart` hierarchy.

| Event name | Dispatch trigger | Handler location | Effect |
|-----------|-----------------|------------------|--------|
| `commandpalette:open` | `TerminalHeader` Cmd+K button, keyboard shortcut | `CommandPalette` | Opens the command palette |
| `ai:toggle` | `CommandPalette` "Ask AI" action | `AIPanel` | Toggles AI panel open/closed |
| `dashboard:switchtab` | `CommandPalette` navigate commands, `AICompanion` deep links | `DashboardTabs` | Sets `activeTab` to the event's `detail.tab` value |

Example dispatch pattern:

```typescript
window.dispatchEvent(new CustomEvent("dashboard:switchtab", {
  detail: { tab: "skills" }
}))
```

---

## 12. Testing

### Framework

- Jest 30 with `ts-jest` transformer.
- React Testing Library 16.
- `@testing-library/jest-dom` for DOM assertion matchers.
- `jest-environment-jsdom` for browser environment simulation.

### Coverage Thresholds

Configured in `jest.config.ts`. Build fails if any threshold is not met:

| Metric | Threshold |
|--------|----------|
| Lines | 85% |
| Functions | 85% |
| Branches | 75% |
| Statements | 85% |

### Test Files

| File | What it covers |
|------|---------------|
| `src/lib/__tests__/analytics.test.ts` | All aggregation functions in `analytics.ts`: deduplication, date resolution, salary parsing (all formats + edge cases), seniority extraction, visa bucketing, location normalization, job function classification, date range filling |
| `src/components/__tests__/MetricCard.test.tsx` | 14 tests: label and value rendering, sparkline presence/absence, delta indicators (▲/▼), accent bar color variants, staggered delay prop |
| `src/components/__tests__/ChartErrorBoundary.test.tsx` | Error boundary renders "RENDER ERROR" on throw; renders children normally when no error |
| `src/components/__tests__/SafePanel.test.tsx` | Panel chrome renders title; delegates to ChartErrorBoundary |
| `src/components/__tests__/EmptyPanel.test.tsx` | Renders title, message, suggestion; shows pulse animation |
| `src/components/__tests__/ScanlineOverlay.test.tsx` | Renders with correct fixed positioning and pointer-events style |
| `src/components/__tests__/CommandPalette.test.tsx` | Opens on event; search filters by label and description; keyboard navigation (↑/↓/Enter/Esc); group rendering |
| `src/components/__tests__/DashboardTabs.test.tsx` | Tab switching; KPI card rendering; lazy-mounting (visited tabs stay in DOM); switchtab event listener |
| `src/components/__tests__/TabNav.test.tsx` | Digit shortcuts 1–5 activate correct tabs; arrow key cycling; active indicator rendering |
| `src/components/__tests__/SkillMomentumTable.test.tsx` | Renders top 10 skills; sparkline column present; responsive 2-column layout |
| `src/components/__tests__/SalaryChart.test.tsx` | Renders salary buckets; shows listed rate and median estimate; handles null data |
| `src/components/__tests__/SalaryByLocationChart.test.tsx` | Renders city bars; sorts by median descending; handles empty data |
| `src/components/__tests__/TimeDistributionChart.test.tsx` | 24 hour bars; weekday filter buttons change displayed data; uses fallback data |

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Coverage output is written to `analytics/coverage/`.

---

## 13. Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | `^15.3.0` | React framework, App Router, API routes, SSR |
| `react` | `^19.0.0` | UI library |
| `react-dom` | `^19.0.0` | React DOM renderer |
| `@supabase/supabase-js` | `^2.98.0` | Supabase client for RPC calls |
| `recharts` | `^2.15.0` | Chart library (Line, Bar, Pie, ComposedChart) |
| `react-simple-maps` | `^3.0.0` | SVG world map for LocationChart |
| `swr` | `^2.3.0` | Data fetching + caching for AI companion hook |
| `@radix-ui/react-dialog` | `^1.1.15` | Accessible dialog primitive (used by AIPanel) |
| `@phosphor-icons/react` | `^2.1.10` | Icon set |
| `clsx` | `^2.1.1` | Conditional className utility |
| `tailwind-merge` | `^3.5.0` | Merge Tailwind class strings without conflicts |
| `date-fns` | `^4.1.0` | Date manipulation (weekday extraction, range filling) |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | `^5` | Type checking |
| `tailwindcss` | `^4` | Utility CSS framework |
| `jest` | `^30.3.0` | Test runner |
| `@testing-library/react` | `^16.3.2` | React component testing utilities |
| `@testing-library/jest-dom` | (peer) | Custom DOM matchers |
| `ts-node` | `^10.9.2` | TypeScript execution for Jest config |
| `postcss` | (peer) | CSS processing (Tailwind pipeline) |

---

## 14. Running Locally

**Prerequisites:** Node.js 18+, npm 9+. A `.env.local` file with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (or equivalent variable names used in `supabase-server.ts`).

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev

# Production build
npm run build

# Start production server (after build)
npm start

# Lint
npm run lint

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

The development server runs with hot reload. API routes are served by Next.js locally at the same origin. Supabase RPC calls require valid credentials in environment variables — without them, all API routes will return 500 errors and the dashboard will render in all-null empty-panel state.
