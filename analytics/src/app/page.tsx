export const revalidate = 60; // Revalidate the page every 60 seconds (ISR)

import TerminalHeader from "@/components/TerminalHeader";
import ScanlineOverlay from "@/components/ScanlineOverlay";
import BootSequence from "@/components/BootSequence";
import AutoRefresh from "@/components/AutoRefresh";
import DashboardTabs from "@/components/DashboardTabs";

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
    const res = await fetch(`${base}${path}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

interface Overview {
  total: number;
  analyzed: number;
  completionRate: number;
  uniqueCompanies: number;
  avgJobsPerDay: number;
  jobs30d: number;
}
interface Companies {
  topCompanies: { company: string; count: number }[];
  hourlyDistribution: { hour: number; count: number }[];
}
interface Skills {
  techSkills: { keyword: string; count: number }[];
  softSkills: { skill: string; count: number }[];
  goodToHave: { keyword: string; count: number }[];
  cooccurrencePairs: { a: string; b: string; count: number }[];
}
interface Timeline {
  timeline: { day: string; count: number }[];
}
interface Locations {
  locations: { city: string; count: number }[];
}
interface Sources {
  sources: { source: string; count: number; color: string }[];
}
interface Visa {
  visa: { label: string; count: number; color: string }[];
  total: number;
  sponsorshipRate: number;
}
interface Salary {
  buckets: { label: string; count: number }[];
  listedRate: number;
  listedCount: number;
  medianEstimate: number | null;
}
interface Seniority {
  seniority: { level: string; count: number; color: string }[];
  titleKeywords: { word: string; count: number }[];
  jobFunctions: { function: string; count: number; color: string }[];
}
interface Weekday {
  weekday: { day: string; count: number }[];
  peakDay: string | null;
}
interface Queue {
  completed: number;
  failed: number;
  pending: number;
  total: number;
  successRate: number;
  withVisa: number;
  withSalary: number;
  analyzedCount: number;
}
interface SkillMomentum {
  skills: { skill: string; total: number; daily: { day: string; count: number }[] }[];
  dailyJobs: { day: string; count: number }[];
  dateRange: { start: string; end: string } | null;
}
interface Experience {
  distribution: { label: string; count: number }[];
  matched: number;
  total: number;
  matchRate: number;
}
interface SalaryByLocation {
  cities: { city: string; median: number; count: number }[];
}
interface HiringVelocity {
  companies: { name: string; color: string }[];
  data: Record<string, string | number>[];
}

export default async function DashboardPage() {
  const [
    overview,
    companies,
    skills,
    timeline,
    locations,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sources,
    visa,
    salary,
    seniority,
    weekday,
    queue,
    skillMomentum,
    experience,
    salaryByLocation,
    hiringVelocity,
  ] = await Promise.all([
    fetchJson<Overview>("/api/analytics/overview"),
    fetchJson<Companies>("/api/analytics/companies"),
    fetchJson<Skills>("/api/analytics/skills"),
    fetchJson<Timeline>("/api/analytics/timeline"),
    fetchJson<Locations>("/api/analytics/locations"),
    fetchJson<Sources>("/api/analytics/sources"),
    fetchJson<Visa>("/api/analytics/visa"),
    fetchJson<Salary>("/api/analytics/salary"),
    fetchJson<Seniority>("/api/analytics/seniority"),
    fetchJson<Weekday>("/api/analytics/weekday"),
    fetchJson<Queue>("/api/analytics/queue"),
    fetchJson<SkillMomentum>("/api/analytics/skill-momentum"),
    fetchJson<Experience>("/api/analytics/experience"),
    fetchJson<SalaryByLocation>("/api/analytics/salary-by-location"),
    fetchJson<HiringVelocity>("/api/analytics/hiring-velocity"),
  ]);

  return (
    <>
      <AutoRefresh />
      <BootSequence />
      <ScanlineOverlay />
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-root)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TerminalHeader />
        <DashboardTabs
          overview={overview}
          companies={companies}
          skills={skills}
          timeline={timeline}
          locations={locations}
          visa={visa}
          salary={salary}
          seniority={seniority}
          weekday={weekday}
          queue={queue}
          skillMomentum={skillMomentum}
          experience={experience}
          salaryByLocation={salaryByLocation}
          hiringVelocity={hiringVelocity}
        />
        <footer
          style={{
            borderTop: "1px solid var(--border)",
            padding: "8px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "var(--muted)",
            letterSpacing: "0.1em",
          }}
        >
          <span>HIREFEED ANALYTICS · MARKET INTELLIGENCE TERMINAL</span>
          <span>UNIQUE JOBS · AUTO-REFRESHES EVERY 60S</span>
        </footer>
      </div>
    </>
  );
}
