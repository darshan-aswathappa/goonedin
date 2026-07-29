export const revalidate = 60; // Revalidate the page every 60 seconds (ISR)

import TerminalHeader from "@/components/TerminalHeader";
import ScanlineOverlay from "@/components/ScanlineOverlay";
import BootSequence from "@/components/BootSequence";
import AutoRefresh from "@/components/AutoRefresh";
import DashboardTabs from "@/components/DashboardTabs";
import {
  fetchOverview,
  fetchCompanies,
  fetchSkills,
  fetchTimeline,
  fetchLocations,
  fetchVisa,
  fetchSalary,
  fetchSeniority,
  fetchWeekday,
  fetchQueue,
  fetchSkillMomentum,
  fetchExperience,
  fetchSalaryByLocation,
  fetchHiringVelocity,
  fetchSalaryByFunction,
  fetchSkillGap,
} from "@/lib/analytics-fetchers";

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
interface SalaryByFunction {
  functions: { function: string; median: number; count: number; color: string }[];
}
interface HiringVelocity {
  companies: { name: string; color: string }[];
  data: Record<string, string | number>[];
}
interface SkillGap {
  skills: {
    skill: string;
    must_have: number;
    good_to_have: number;
    total: number;
    recent: number;
    prior: number;
    growth: number;
  }[];
  dateRange: { start: string; end: string } | null;
}

export default async function DashboardPage() {
  const [
    overview,
    companies,
    skills,
    timeline,
    locations,
    visa,
    salary,
    seniority,
    weekday,
    queue,
    skillMomentum,
    experience,
    salaryByLocation,
    hiringVelocity,
    salaryByFunction,
    skillGap,
  ] = await Promise.all([
    fetchOverview(),
    fetchCompanies(),
    fetchSkills(),
    fetchTimeline(),
    fetchLocations(),
    fetchVisa(),
    fetchSalary(),
    fetchSeniority(),
    fetchWeekday(),
    fetchQueue(),
    fetchSkillMomentum(),
    fetchExperience(),
    fetchSalaryByLocation(),
    fetchHiringVelocity(),
    fetchSalaryByFunction(),
    fetchSkillGap(),
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
          salaryByFunction={salaryByFunction}
          skillGap={skillGap}
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
