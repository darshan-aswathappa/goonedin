// Server-only — never import from client components

import { createServerClient } from "@/lib/supabase-server";
import {
  fillDateRange,
  normalizeLocation,
  aggregateVisa,
  aggregateSalary,
  aggregateSeniority,
  aggregateTitleKeywords,
  aggregateJobFunctions,
  aggregateSalaryByFunction,
  deduplicateJobs,
  resolveJobDate,
} from "@/lib/analytics";
import { getBlockedCompanies, isBlocked } from "@/lib/blocked-companies";

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function classifyCity(location: string | null): string | null {
  if (!location) return null;
  const lower = location.toLowerCase();
  if (lower.includes("remote") && !lower.includes(",")) return "Remote";
  if (lower.includes("san francisco") || lower === "sf") return "San Francisco, CA";
  if (lower.includes("new york") || lower === "nyc") return "New York, NY";
  if (lower.includes("seattle")) return "Seattle, WA";
  if (lower.includes("austin")) return "Austin, TX";
  if (lower.includes("boston")) return "Boston, MA";
  if (lower.includes("los angeles") || lower === "la") return "Los Angeles, CA";
  if (lower.includes("chicago")) return "Chicago, IL";
  if (lower.includes("denver")) return "Denver, CO";
  if (lower.includes("washington") || lower === "dc") return "Washington, DC";
  if (
    lower.includes("san jose") ||
    lower.includes("palo alto") ||
    lower.includes("mountain view") ||
    lower.includes("menlo park") ||
    lower.includes("sunnyvale") ||
    lower.includes("cupertino")
  )
    return "Bay Area (South), CA";
  if (lower.includes("atlanta")) return "Atlanta, GA";
  return null;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export async function fetchOverview() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_overview");
    if (error) throw error;
    const d = data as {
      total: number;
      uniqueCompanies: number;
      analyzed: number;
      jobs30d: number;
      avgJobsPerDay: number;
    };
    return {
      total: d.total,
      analyzed: d.analyzed,
      completionRate: d.total > 0 ? Math.round((d.analyzed / d.total) * 100) : 0,
      uniqueCompanies: d.uniqueCompanies,
      avgJobsPerDay: d.avgJobsPerDay,
      jobs30d: d.jobs30d,
    };
  } catch {
    return null;
  }
}

export async function fetchCompanies() {
  try {
    const sb = createServerClient();
    const [companiesRes, hourlyRes, blocked] = await Promise.all([
      sb.rpc("analytics_top_companies"),
      sb.rpc("analytics_hourly_distribution"),
      getBlockedCompanies(),
    ]);
    if (companiesRes.error) throw companiesRes.error;
    if (hourlyRes.error) throw hourlyRes.error;
    const topCompanies = (companiesRes.data as { company: string; count: number }[])
      .filter((r) => !isBlocked(r.company, blocked))
      .map((r) => ({ company: r.company, count: Number(r.count) }));
    const hourlyRaw = (hourlyRes.data as { hour: number; count: number }[]).map((r) => ({
      hour: Number(r.hour),
      count: Number(r.count),
    }));
    const hourMap = new Map(hourlyRaw.map((r) => [r.hour, r.count]));
    const hourlyDistribution = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourMap.get(h) ?? 0,
    }));
    return { topCompanies, hourlyDistribution };
  } catch {
    return null;
  }
}

export async function fetchSkills() {
  try {
    const sb = createServerClient();
    const [techRes, goodRes, qualsRes] = await Promise.all([
      sb.rpc("analytics_tech_skills"),
      sb.rpc("analytics_good_to_have"),
      sb.rpc("analytics_qualifications"),
    ]);
    if (techRes.error) throw techRes.error;
    if (goodRes.error) throw goodRes.error;
    if (qualsRes.error) throw qualsRes.error;
    const techSkills = (techRes.data as { keyword: string; count: number }[]).map((r) => ({
      keyword: r.keyword,
      count: Number(r.count),
    }));
    const goodToHave = (goodRes.data as { keyword: string; count: number }[]).map((r) => ({
      keyword: r.keyword,
      count: Number(r.count),
    }));
    const SOFT_PATTERNS: [RegExp, string][] = [
      [/communication/i, "Communication"],
      [/team|collaboration|collaborative/i, "Teamwork"],
      [/problem.solv/i, "Problem Solving"],
      [/leadership/i, "Leadership"],
      [/agile|scrum/i, "Agile / Scrum"],
      [/fast.paced/i, "Fast-Paced Env"],
      [/cross.functional/i, "Cross-Functional"],
      [/detail.oriented/i, "Detail-Oriented"],
      [/self.starter|self.motivated/i, "Self-Starter"],
      [/time management/i, "Time Management"],
      [/critical thinking/i, "Critical Thinking"],
      [/analytical/i, "Analytical Thinking"],
      [/mentor|coach/i, "Mentoring"],
      [/presentation|present\b/i, "Presentation Skills"],
      [/written.*communication|writing skills/i, "Written Communication"],
      [/adaptab|flexible/i, "Adaptability"],
      [/ownership|accountab/i, "Ownership"],
      [/ambiguous|ambiguity/i, "Navigating Ambiguity"],
    ];
    const softFreq: Record<string, number> = {};
    for (const row of qualsRes.data as { qualification: string; count: number }[]) {
      for (const [re, label] of SOFT_PATTERNS) {
        if (re.test(row.qualification)) {
          softFreq[label] = (softFreq[label] ?? 0) + Number(row.count);
          break;
        }
      }
    }
    const softSkills = Object.entries(softFreq)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count);
    const coocRes = await sb.rpc("analytics_skill_cooccurrence");
    if (coocRes.error) throw coocRes.error;
    const cooccurrencePairs = (
      coocRes.data as { skill_a: string; skill_b: string; pair_count: number }[]
    ).map((r) => ({ a: r.skill_a, b: r.skill_b, count: Number(r.pair_count) }));
    return { techSkills, softSkills, goodToHave, cooccurrencePairs };
  } catch {
    return null;
  }
}

export async function fetchTimeline() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_timeline", {
      p_days: 30,
      p_source: null,
    });
    if (error) throw error;
    const raw = (data as { day: string; count: number }[]).map((r) => ({
      day: r.day,
      count: Number(r.count),
    }));
    const timeline = fillDateRange(raw, 30);
    return { timeline };
  } catch {
    return null;
  }
}

export async function fetchLocations() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_locations");
    if (error) throw error;
    const COUNTRY_FILTER = new Set([
      "united states",
      "usa",
      "us",
      "u.s.",
      "u.s.a.",
      "america",
      "canada",
      "united kingdom",
      "uk",
      "india",
      "germany",
      "worldwide",
    ]);
    const freq: Record<string, number> = {};
    for (const row of data as { location: string; count: number }[]) {
      const city = normalizeLocation(row.location);
      if (!city || city.length < 2) continue;
      if (COUNTRY_FILTER.has(city.toLowerCase())) continue;
      freq[city] = (freq[city] ?? 0) + Number(row.count);
    }
    const locations = Object.entries(freq)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);
    return { locations };
  } catch {
    return null;
  }
}

export async function fetchVisa() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_visa");
    if (error) throw error;
    const rows = (data as { visa: string; count: number }[]).flatMap((r) => {
      const visaVal = r.visa === "__null__" ? null : r.visa;
      return Array.from({ length: Number(r.count) }, () => ({ visa: visaVal }));
    });
    const visa = aggregateVisa(rows);
    const knownTotal = visa
      .filter((v) => v.label !== "Unknown")
      .reduce((s, v) => s + v.count, 0);
    const sponsorship = visa.find((v) => v.label === "Sponsorship Available");
    const total = visa.reduce((s, v) => s + v.count, 0);
    const sponsorshipRate =
      knownTotal > 0 && sponsorship
        ? Math.round((sponsorship.count / knownTotal) * 100)
        : 0;
    return { visa, total, sponsorshipRate };
  } catch {
    return null;
  }
}

export async function fetchSalary() {
  try {
    const sb = createServerClient();
    const [salaryRes, overviewRes] = await Promise.all([
      sb.rpc("analytics_salary_strings"),
      sb.rpc("analytics_overview"),
    ]);
    if (salaryRes.error) throw salaryRes.error;
    const totalJobs = overviewRes.error
      ? undefined
      : (overviewRes.data as { total: number })?.total;
    const MAX_EXPANSION = 50_000;
    let expanded = 0;
    const rows: { external_id: string; salary: string }[] = [];
    for (const r of salaryRes.data as { salary: string; count: number }[]) {
      const count = Math.min(Number(r.count) || 0, MAX_EXPANSION - expanded);
      if (count <= 0) break;
      for (let i = 0; i < count; i++) {
        rows.push({ external_id: `${r.salary}-${i}`, salary: r.salary });
      }
      expanded += count;
    }
    return aggregateSalary(rows, totalJobs);
  } catch {
    return null;
  }
}

export async function fetchSeniority() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_titles");
    if (error) throw error;
    const expanded = (data as { title: string; count: number }[]).flatMap((r) =>
      Array.from({ length: Number(r.count) }, () => ({ title: r.title }))
    );
    const seniority = aggregateSeniority(expanded);
    const titleKeywords = aggregateTitleKeywords(expanded);
    const jobFunctions = aggregateJobFunctions(expanded);
    return { seniority, titleKeywords, jobFunctions };
  } catch {
    return null;
  }
}

export async function fetchWeekday() {
  try {
    const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_weekday");
    if (error) throw error;
    const dowMap = new Map(
      (data as { dow: number; day_name: string; count: number }[]).map((r) => [
        Number(r.dow),
        Number(r.count),
      ])
    );
    const weekday = WEEKDAYS.map((day, i) => ({ day, count: dowMap.get(i) ?? 0 }));
    const peak = weekday.reduce(
      (best, d) => (d.count > best.count ? d : best),
      weekday[0]
    );
    return { weekday, peakDay: peak?.day ?? null };
  } catch {
    return null;
  }
}

export async function fetchQueue() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_queue_health");
    if (error) throw error;
    const d = data as {
      completed: number;
      failed: number;
      pending: number;
      total: number;
      withVisa: number;
      withSalary: number;
      analyzedCount: number;
    };
    const total = Number(d.total);
    const completed = Number(d.completed);
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      completed,
      failed: Number(d.failed),
      pending: Number(d.pending),
      total,
      successRate,
      withVisa: Number(d.withVisa),
      withSalary: Number(d.withSalary),
      analyzedCount: Number(d.analyzedCount),
    };
  } catch {
    return null;
  }
}

export async function fetchSkillMomentum() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_skill_momentum");
    if (error) throw error;
    const result = data as {
      skills:
        | { skill: string; total: number; daily: { day: string; count: number }[] }[]
        | null;
      dailyJobs: { day: string; count: number }[] | null;
      dateRange: { start: string; end: string } | null;
    };
    if (!result?.skills?.length) return { skills: [], dailyJobs: [], dateRange: null };
    return {
      skills: result.skills,
      dailyJobs: result.dailyJobs ?? [],
      dateRange: result.dateRange,
    };
  } catch {
    return null;
  }
}

export async function fetchExperience() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_experience_distribution");
    if (error) throw error;
    const result = data as {
      distribution: { label: string; count: number }[] | null;
      matched: number;
      total: number;
      matchRate: number;
    };
    return {
      distribution: result?.distribution ?? [],
      matched: result?.matched ?? 0,
      total: result?.total ?? 0,
      matchRate: result?.matchRate ?? 0,
    };
  } catch {
    return null;
  }
}

export async function fetchSalaryByLocation() {
  try {
    const sb = createServerClient();
    const { data: rows, error } = await sb
      .from("scraped_jobs")
      .select("external_id, salary, location, created_at")
      .not("salary", "is", null);
    if (error) throw error;
    const seen = new Map<string, (typeof rows)[0]>();
    const sorted = [...(rows ?? [])].sort((a, b) =>
      (a.created_at ?? "9999") < (b.created_at ?? "9999") ? -1 : 1
    );
    for (const row of sorted) {
      if (!seen.has(row.external_id)) seen.set(row.external_id, row);
    }
    const cityGroups: Record<string, { external_id: string; salary: string }[]> = {};
    for (const row of seen.values()) {
      const city = classifyCity(row.location);
      if (!city || !row.salary) continue;
      if (!cityGroups[city]) cityGroups[city] = [];
      cityGroups[city].push({ external_id: row.external_id, salary: row.salary });
    }
    const cityData: { city: string; median: number; count: number }[] = [];
    for (const [city, salaryRows] of Object.entries(cityGroups)) {
      const result = aggregateSalary(salaryRows);
      if (result.medianEstimate && result.listedCount >= 3) {
        cityData.push({ city, median: result.medianEstimate, count: result.listedCount });
      }
    }
    cityData.sort((a, b) => b.median - a.median);
    return { cities: cityData };
  } catch {
    return null;
  }
}

export async function fetchHiringVelocity() {
  try {
    const COMPANY_COLORS = ["#00bfff", "#ff6b6b", "#4ade80", "#ffd700", "#f97316"];
    const sb = createServerClient();
    const [topRes, blocked] = await Promise.all([
      sb.rpc("analytics_top_companies"),
      getBlockedCompanies(),
    ]);
    if (topRes.error) throw topRes.error;
    const top5 = (topRes.data as { company: string; count: number }[])
      .filter((r) => !isBlocked(r.company, blocked))
      .slice(0, 5)
      .map((r) => r.company);
    if (!top5.length) return { companies: [], data: [] };
    const days = 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateLabels: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dateLabels.push(d.toISOString().slice(0, 10));
    }
    const cutoff = dateLabels[0];
    const { data: rows, error } = await sb
      .from("scraped_jobs")
      .select("company, posted_at, created_at, external_id")
      .in("company", top5)
      .gte("created_at", cutoff);
    if (error) throw error;
    const seen = new Set<string>();
    const counts: Record<string, Record<string, number>> = {};
    for (const company of top5) {
      counts[company] = {};
      for (const day of dateLabels) counts[company][day] = 0;
    }
    for (const row of rows as {
      company: string;
      posted_at: string | null;
      created_at: string | null;
      external_id: string;
    }[]) {
      const key = `${row.company}:${row.external_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const day = resolveJobDate(row);
      if (!day || !counts[row.company] || !dateLabels.includes(day)) continue;
      counts[row.company][day]++;
    }
    const data = dateLabels.map((day) => {
      const entry: Record<string, string | number> = { day };
      for (const company of top5) entry[company] = counts[company]?.[day] ?? 0;
      return entry;
    });
    const companies = top5.map((name, i) => ({
      name,
      color: COMPANY_COLORS[i] ?? "#64748b",
    }));
    return { companies, data };
  } catch {
    return null;
  }
}

export async function fetchSalaryByFunction() {
  try {
    const sb = createServerClient();
    const { data: rows, error } = await sb
      .from("scraped_jobs")
      .select("external_id, title, salary, created_at")
      .not("salary", "is", null)
      .not("title", "is", null);
    if (error) throw error;
    const deduped = deduplicateJobs(rows ?? []);
    const functions = aggregateSalaryByFunction(
      deduped.map((r) => ({
        external_id: r.external_id,
        title: (r as { title?: string | null }).title ?? null,
        salary: (r as { salary?: string | null }).salary ?? null,
      }))
    );
    return { functions };
  } catch {
    return null;
  }
}

export async function fetchSkillGap() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_skill_gap");
    if (error) throw error;
    const result = data as {
      skills:
        | {
            skill: string;
            must_have: number;
            good_to_have: number;
            total: number;
            recent: number;
            prior: number;
            growth: number;
          }[]
        | null;
      dateRange: { start: string; end: string } | null;
    };
    if (!result?.skills?.length) return { skills: [], dateRange: null };
    return { skills: result.skills, dateRange: result.dateRange };
  } catch {
    return null;
  }
}
