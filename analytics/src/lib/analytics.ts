/**
 * Server-side aggregation helpers for the analytics dashboard.
 * All functions run in Node.js (API routes / server components) — never bundled to the client.
 */

export interface JobAnalysis {
  must_have_keywords?: string[];
  good_to_have_keywords?: string[];
  minimum_qualifications?: string[];
  summary?: string;
  compensation?: string | null;
  visa_status?: string | null;
}

// ---------------------------------------------------------------------------
// Deduplication (scraped_jobs has one row per user×job — deduplicate by external_id)
// ---------------------------------------------------------------------------

export function deduplicateJobs<T extends { external_id: string; created_at?: string | null }>(
  rows: T[]
): T[] {
  // Sort ascending by created_at so earliest scrape wins
  const sorted = [...rows].sort((a, b) => {
    const ta = a.created_at ?? "9999";
    const tb = b.created_at ?? "9999";
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  const map = new Map<string, T>();
  for (const row of sorted) {
    if (!map.has(row.external_id)) map.set(row.external_id, row);
  }
  return Array.from(map.values());
}

/**
 * Resolve best date for a job.
 * Prefers posted_at (actual job post date) over created_at (scrape date).
 * Falls back to created_at if posted_at is missing or implausible.
 */
export function resolveJobDate(row: {
  posted_at?: string | null;
  created_at?: string | null;
}): string | null {
  const now = new Date();
  const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (
    row.posted_at &&
    row.posted_at >= twoYearsAgo &&
    row.posted_at <= oneWeekAhead
  ) {
    return row.posted_at.slice(0, 10);
  }
  return row.created_at?.slice(0, 10) ?? null;
}

// ---------------------------------------------------------------------------
// Skills aggregation
// ---------------------------------------------------------------------------

export function aggregateSkills(
  rows: { analysis: unknown }[]
): { keyword: string; count: number }[] {
  const freq: Record<string, number> = {};

  for (const row of rows) {
    const analysis = parseAnalysis(row.analysis);
    if (!analysis) continue;

    const keywords = [
      ...(analysis.must_have_keywords ?? []),
      ...(analysis.good_to_have_keywords ?? []),
    ];

    for (const raw of keywords) {
      const kw = normalizeKeyword(raw);
      if (kw) freq[kw] = (freq[kw] ?? 0) + 1;
    }
  }

  return Object.entries(freq)
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);
}

export function aggregateSoftSkills(
  rows: { analysis: unknown }[]
): { skill: string; count: number }[] {
  const freq: Record<string, number> = {};

  for (const row of rows) {
    const analysis = parseAnalysis(row.analysis);
    if (!analysis?.minimum_qualifications) continue;

    for (const raw of analysis.minimum_qualifications) {
      const kw = extractSoftSkill(raw);
      if (kw) freq[kw] = (freq[kw] ?? 0) + 1;
    }
  }

  return Object.entries(freq)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// Salary aggregation
// ---------------------------------------------------------------------------

export interface SalaryResult {
  buckets: { label: string; count: number }[];
  listedCount: number;
  unlistedCount: number;
  listedRate: number;
  medianEstimate: number | null;
}

const SALARY_BUCKETS = [
  { label: "< $80K", min: 0, max: 80_000 },
  { label: "$80K–$100K", min: 80_000, max: 100_000 },
  { label: "$100K–$130K", min: 100_000, max: 130_000 },
  { label: "$130K–$160K", min: 130_000, max: 160_000 },
  { label: "$160K–$200K", min: 160_000, max: 200_000 },
  { label: "> $200K", min: 200_000, max: Infinity },
];

export function aggregateSalary(
  rows: { salary?: string | null; external_id: string }[]
): SalaryResult {
  const counts = Array(SALARY_BUCKETS.length).fill(0);
  let listedCount = 0;
  let unlistedCount = 0;
  const annualValues: number[] = [];

  for (const row of rows) {
    const s = row.salary?.trim() ?? "";
    if (!s || /not\s+listed|n\/a|^-$/i.test(s)) {
      unlistedCount++;
      continue;
    }

    const isHourly = /\/hr|per\s+hour|hourly/i.test(s);
    const nums =
      s.match(/[\d,]+\.?\d*/g)?.map((n) => parseFloat(n.replace(/,/g, ""))) ??
      [];
    if (!nums.length) {
      unlistedCount++;
      continue;
    }

    listedCount++;
    const isK = /\d+\.?\d*\s*k\b/i.test(s);
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    let annual = isK && avg < 500 ? avg * 1_000 : avg;
    if (isHourly) annual = annual * 2_080; // 40 hrs × 52 wks

    annualValues.push(annual);
    for (let i = 0; i < SALARY_BUCKETS.length; i++) {
      if (annual >= SALARY_BUCKETS[i].min && annual < SALARY_BUCKETS[i].max) {
        counts[i]++;
        break;
      }
    }
  }

  const buckets = SALARY_BUCKETS.map((b, i) => ({
    label: b.label,
    count: counts[i],
  })).filter((b) => b.count > 0);

  let medianEstimate: number | null = null;
  if (annualValues.length) {
    const sorted = [...annualValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianEstimate =
      sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : Math.round(sorted[mid]);
  }

  const total = listedCount + unlistedCount;
  const listedRate = total > 0 ? Math.round((listedCount / total) * 100) : 0;

  return { buckets, listedCount, unlistedCount, listedRate, medianEstimate };
}

// ---------------------------------------------------------------------------
// Seniority aggregation
// ---------------------------------------------------------------------------

const SENIORITY_COLORS: Record<string, string> = {
  Intern: "#64748b",
  Junior: "#3b82f6",
  "Mid-Level": "#00d4aa",
  Senior: "#4ade80",
  "Staff/Principal": "#a855f7",
  "Lead/Manager": "#f59e0b",
  "Director+": "#ef4444",
};

export function extractSeniority(title: string): string {
  const lower = title.toLowerCase();
  if (/\b(intern|internship|co-?op)\b/.test(lower)) return "Intern";
  if (/\b(junior|jr\.?|entry.?level|associate|new grad)\b/.test(lower))
    return "Junior";
  if (/\b(staff|principal|distinguished|fellow)\b/.test(lower))
    return "Staff/Principal";
  if (/\b(director|head of|vp\b|vice president)\b/.test(lower))
    return "Director+";
  if (/\b(lead|manager|tech lead|engineering manager)\b/.test(lower))
    return "Lead/Manager";
  if (/\b(senior|sr\.?|\biii\b|\biv\b)\b/.test(lower)) return "Senior";
  return "Mid-Level";
}

export function aggregateSeniority(
  rows: { title?: string | null }[]
): { level: string; count: number; color: string }[] {
  const freq: Record<string, number> = {};
  for (const row of rows) {
    if (!row.title) continue;
    const level = extractSeniority(row.title);
    freq[level] = (freq[level] ?? 0) + 1;
  }
  return Object.entries(freq)
    .map(([level, count]) => ({
      level,
      count,
      color: SENIORITY_COLORS[level] ?? "#64748b",
    }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Weekday posting distribution
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function aggregateWeekday(
  rows: { posted_at?: string | null; created_at?: string | null }[]
): { day: string; count: number }[] {
  const freq = Array(7).fill(0);
  for (const row of rows) {
    const dateStr = row.posted_at || row.created_at;
    if (!dateStr) continue;
    const d = new Date(dateStr).getDay();
    if (d >= 0 && d < 7) freq[d]++;
  }
  return WEEKDAYS.map((day, i) => ({ day, count: freq[i] }));
}

// ---------------------------------------------------------------------------
// Title keyword aggregation
// ---------------------------------------------------------------------------

const TITLE_STOPWORDS = new Set([
  "engineer", "software", "senior", "junior", "lead", "staff", "principal",
  "developer", "architect", "manager", "director", "head", "associate",
  "intern", "ii", "iii", "iv", "and", "the", "for", "of", "at", "in",
  "with", "or", "new", "entry", "level", "sr", "jr", "mid",
]);

export function aggregateTitleKeywords(
  rows: { title?: string | null }[]
): { word: string; count: number }[] {
  const freq: Record<string, number> = {};
  for (const row of rows) {
    if (!row.title) continue;
    const words = row.title
      .toLowerCase()
      .replace(/[^a-z\s/-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w));
    for (const word of words) {
      freq[word] = (freq[word] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
}

// ---------------------------------------------------------------------------
// Visa aggregation
// ---------------------------------------------------------------------------

export interface VisaBucket {
  label: string;
  count: number;
  color: string;
}

export function aggregateVisa(
  rows: { visa?: string | null; visa_status?: string | null }[]
): VisaBucket[] {
  const freq: Record<string, number> = {};
  const normalize = (v: string | null | undefined): string => {
    if (!v) return "Unknown";
    const lower = v.toLowerCase();
    if (lower.includes("sponsor") && lower.includes("not")) return "No Sponsorship";
    if (lower.includes("sponsor")) return "Sponsorship Available";
    if (lower.includes("citizen") || lower.includes("gc")) return "Citizens/GC Only";
    if (lower.includes("unknown") || lower.includes("n/a") || lower.includes("not specified")) return "Unknown";
    return "Other";
  };

  for (const row of rows) {
    const bucket = normalize(row.visa ?? row.visa_status ?? null);
    freq[bucket] = (freq[bucket] ?? 0) + 1;
  }

  const COLORS: Record<string, string> = {
    "Sponsorship Available": "#00d4aa",
    "No Sponsorship": "#ef4444",
    "Citizens/GC Only": "#f59e0b",
    Unknown: "#64748b",
    Other: "#3b82f6",
  };

  return Object.entries(freq)
    .map(([label, count]) => ({ label, count, color: COLORS[label] ?? "#a855f7" }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Location normalization
// ---------------------------------------------------------------------------

const CITY_ALIASES: Record<string, string> = {
  "new york": "New York, NY",
  "new york city": "New York, NY",
  nyc: "New York, NY",
  "san francisco": "San Francisco, CA",
  sf: "San Francisco, CA",
  "los angeles": "Los Angeles, CA",
  la: "Los Angeles, CA",
  chicago: "Chicago, IL",
  seattle: "Seattle, WA",
  boston: "Boston, MA",
  austin: "Austin, TX",
  denver: "Denver, CO",
  atlanta: "Atlanta, GA",
  "washington dc": "Washington, DC",
  dc: "Washington, DC",
  "washington d.c": "Washington, DC",
  "san jose": "San Jose, CA",
  "san diego": "San Diego, CA",
  "palo alto": "Palo Alto, CA",
  "menlo park": "Menlo Park, CA",
  "mountain view": "Mountain View, CA",
  "new jersey": "New Jersey",
  nj: "New Jersey",
  remote: "Remote",
};

export function normalizeLocation(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower.includes("remote") && !lower.includes(",")) return "Remote";

  for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }

  // Return first 2 comma-separated parts (city, state)
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
  return parts[0] || null;
}

export function aggregateLocations(
  rows: { location?: string | null }[]
): { city: string; count: number }[] {
  const freq: Record<string, number> = {};
  for (const row of rows) {
    const city = normalizeLocation(row.location);
    if (!city || city.length < 2) continue;
    freq[city] = (freq[city] ?? 0) + 1;
  }
  return Object.entries(freq)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function fillDateRange(
  data: { day: string; count: number }[],
  days = 30
): { day: string; count: number }[] {
  const map = new Map(data.map((d) => [d.day, d.count]));
  const result: { day: string; count: number }[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ day: key, count: map.get(key) ?? 0 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

export function parseAnalysis(raw: unknown): JobAnalysis | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as JobAnalysis;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as JobAnalysis;
  return null;
}

function normalizeKeyword(raw: string): string {
  const kw = raw.trim();
  if (kw.length < 2 || kw.length > 40) return "";
  const ACRONYMS = new Set([
    "sql", "api", "rest", "grpc", "aws", "gcp", "ci/cd", "mlops",
    "etl", "elt", "rdbms", "css", "html", "ui", "ux", "git",
    "k8s", "nlp", "llm", "ml", "ai",
  ]);
  if (ACRONYMS.has(kw.toLowerCase())) return kw.toUpperCase();
  return kw;
}

function extractSoftSkill(raw: string): string {
  const lower = raw.toLowerCase();
  const PATTERNS: [RegExp, string][] = [
    [/communication/i, "Communication"],
    [/team|collaboration|collaborative/i, "Teamwork"],
    [/problem.solv/i, "Problem Solving"],
    [/bachelor|bs |b\.s\.|b\.sc/i, "Bachelor's Degree"],
    [/master|ms |m\.s\.|m\.sc/i, "Master's Degree"],
    [/leadership|lead/i, "Leadership"],
    [/agile|scrum/i, "Agile/Scrum"],
    [/years.*experience|experience.*years/i, "Experience Years"],
    [/fast.paced/i, "Fast-Paced Environment"],
    [/cross.functional/i, "Cross-Functional"],
    [/detail.oriented/i, "Detail-Oriented"],
    [/self.starter|self.motivated/i, "Self-Starter"],
    [/time management/i, "Time Management"],
    [/critical thinking/i, "Critical Thinking"],
  ];

  for (const [re, label] of PATTERNS) {
    if (re.test(lower)) return label;
  }

  return raw.length > 30 ? raw.slice(0, 30) + "…" : raw;
}

// ---------------------------------------------------------------------------
// Job function categorization from title
// ---------------------------------------------------------------------------

export function aggregateJobFunctions(
  rows: { title?: string | null }[]
): { function: string; count: number; color: string }[] {
  const FUNCTIONS: { key: string; pattern: RegExp; color: string }[] = [
    { key: 'Full Stack', pattern: /full.?stack/i, color: '#00d4aa' },
    { key: 'Frontend', pattern: /front.?end|react\s+eng|angular\s+eng|vue\s+eng|ui\s+eng/i, color: '#3b82f6' },
    { key: 'Backend', pattern: /back.?end|api\s+eng|server.side/i, color: '#4ade80' },
    { key: 'Data Eng', pattern: /data\s+eng|etl\s+eng|analytics\s+eng|pipeline\s+eng/i, color: '#f59e0b' },
    { key: 'ML/AI', pattern: /machine\s+learning|ml\s+eng|ai\s+eng|deep\s+learning|llm\s+eng|nlp\s+eng/i, color: '#a855f7' },
    { key: 'DevOps/SRE', pattern: /devops|site\s+reliability|platform\s+eng|infrastructure\s+eng|cloud\s+eng/i, color: '#ef4444' },
    { key: 'Mobile', pattern: /\bios\b|\bandroid\b|flutter|react\s+native|mobile\s+eng/i, color: '#06b6d4' },
    { key: 'Security', pattern: /security\s+eng|cybersecurity|infosec/i, color: '#f97316' },
    { key: 'Embedded', pattern: /embedded|firmware/i, color: '#84cc16' },
  ];

  const freq: Record<string, number> = {};
  let other = 0;

  for (const row of rows) {
    if (!row.title) continue;
    let matched = false;
    for (const fn of FUNCTIONS) {
      if (fn.pattern.test(row.title)) {
        freq[fn.key] = (freq[fn.key] ?? 0) + 1;
        matched = true;
        break;
      }
    }
    if (!matched) other++;
  }

  if (other > 0) freq['General SW'] = other;

  const colorMap = Object.fromEntries([...FUNCTIONS.map(f => [f.key, f.color]), ['General SW', '#64748b']]);

  return Object.entries(freq)
    .map(([fn, count]) => ({ function: fn, count, color: colorMap[fn] ?? '#64748b' }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Good-to-have keywords aggregation
// ---------------------------------------------------------------------------

export function aggregateGoodToHave(
  rows: { analysis: unknown }[]
): { keyword: string; count: number }[] {
  const freq: Record<string, number> = {};
  for (const row of rows) {
    const analysis = parseAnalysis(row.analysis);
    if (!analysis?.good_to_have_keywords) continue;
    for (const raw of analysis.good_to_have_keywords) {
      const kw = raw.trim();
      if (kw.length >= 2 && kw.length <= 40) {
        const key = kw.toLowerCase().startsWith('aws') || kw.toLowerCase().startsWith('gcp') || kw.toUpperCase() === kw
          ? kw.toUpperCase() : kw;
        freq[key] = (freq[key] ?? 0) + 1;
      }
    }
  }
  return Object.entries(freq)
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}
