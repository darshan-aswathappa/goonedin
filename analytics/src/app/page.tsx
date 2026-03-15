export const dynamic = "force-dynamic";

import TerminalHeader from "@/components/TerminalHeader";
import MetricCard from "@/components/MetricCard";
import JobVolumeChart from "@/components/JobVolumeChart";
import CompanyLeaderboard from "@/components/CompanyLeaderboard";
import SkillsFrequency from "@/components/SkillsFrequency";
import SoftSkillsPanel from "@/components/SoftSkillsPanel";
import GoodToHavePanel from "@/components/GoodToHavePanel";
import PostingHeatmap from "@/components/PostingHeatmap";
import LocationChart from "@/components/LocationChart";
import VisaStats from "@/components/VisaStats";
import IntelPanel from "@/components/IntelPanel";
import SalaryChart from "@/components/SalaryChart";
import SeniorityChart from "@/components/SeniorityChart";
import WeekdayChart from "@/components/WeekdayChart";
import TitleKeywordsPanel from "@/components/TitleKeywordsPanel";
import JobFunctionsChart from "@/components/JobFunctionsChart";
import QueueHealth from "@/components/QueueHealth";
import SkillCooccurrence from "@/components/SkillCooccurrence";
import TimeDistributionChart from "@/components/TimeDistributionChart";
import ScanlineOverlay from "@/components/ScanlineOverlay";

export const revalidate = 60;

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

export default async function DashboardPage() {
  const [
    overview,
    companies,
    skills,
    timeline,
    locations,
    sources,
    visa,
    salary,
    seniority,
    weekday,
    queue,
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
  ]);

  const sparkline = (timeline?.timeline ?? []).map((d) => ({ v: d.count }));

  return (
    <>
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

        <main
          style={{
            flex: 1,
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* Row 1: KPI Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "12px",
              height: "110px",
            }}
          >
            <MetricCard
              label="Unique Postings"
              value={overview?.total ?? 0}
              subLabel="after deduplication"
              accent="teal"
              sparklineData={sparkline}
              delay={0}
            />
            <MetricCard
              label="AI Analyzed"
              value={overview?.analyzed ?? 0}
              subLabel={`${overview?.completionRate ?? 0}% coverage`}
              accent="green"
              delay={60}
            />
            <MetricCard
              label="Companies"
              value={overview?.uniqueCompanies ?? 0}
              subLabel="unique employers"
              accent="blue"
              delay={120}
            />
            <MetricCard
              label="Jobs / Day"
              value={overview?.avgJobsPerDay ?? 0}
              subLabel="30-day average"
              accent="amber"
              delay={180}
            />
            <MetricCard
              label="Salary Listed"
              value={salary?.listedRate ?? 0}
              subLabel="% disclose salary"
              accent="teal"
              delay={240}
            />
          </div>

          {/* Row 2: Volume + Sources */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "12px",
              height: "240px",
            }}
          >
            <JobVolumeChart data={timeline?.timeline ?? []} />
          </div>

          {/* Row 3: Companies + Locations */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              height: "300px",
            }}
          >
            <CompanyLeaderboard data={companies?.topCompanies ?? []} />
            <LocationChart data={locations?.locations ?? []} />
          </div>

          {/* Row 4: Skills + Good-to-Have + Heatmap */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "12px",
              height: "280px",
            }}
          >
            <SkillsFrequency data={skills?.techSkills ?? []} />
            <GoodToHavePanel data={skills?.goodToHave ?? []} />
            <PostingHeatmap data={companies?.hourlyDistribution ?? []} />
          </div>

          {/* Row 5: Soft Skills + Skill Co-occurrence */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: "12px",
              height: "280px",
            }}
          >
            <SoftSkillsPanel data={skills?.softSkills ?? []} />
            <SkillCooccurrence data={skills?.cooccurrencePairs ?? []} />
          </div>

          {/* Row 6: Seniority + Weekday + Time Distribution */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "300px 1fr 1fr",
              gap: "12px",
              height: "240px",
            }}
          >
            <SeniorityChart data={seniority?.seniority ?? []} />
            <WeekdayChart
              data={weekday?.weekday ?? []}
              peakDay={weekday?.peakDay ?? null}
            />
            <TimeDistributionChart fallbackData={companies?.hourlyDistribution ?? []} />
          </div>

          {/* Row 7: Visa + Job Functions */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              height: "260px",
            }}
          >
            <VisaStats
              data={visa?.visa ?? []}
              sponsorshipRate={visa?.sponsorshipRate ?? 0}
              total={visa?.total ?? 0}
            />
            <JobFunctionsChart data={seniority?.jobFunctions ?? []} />
          </div>

          {/* Row 8: Salary + Title Keywords */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: "12px",
              height: "260px",
            }}
          >
            <SalaryChart
              buckets={salary?.buckets ?? []}
              listedRate={salary?.listedRate ?? 0}
              listedCount={salary?.listedCount ?? 0}
              medianEstimate={salary?.medianEstimate ?? null}
            />
            <TitleKeywordsPanel data={seniority?.titleKeywords ?? []} />
          </div>

          {/* Row 9: Queue Health + Intel Panel */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: "12px",
              height: "160px",
            }}
          >
            <QueueHealth
              completed={queue?.completed ?? 0}
              failed={queue?.failed ?? 0}
              pending={queue?.pending ?? 0}
              total={queue?.total ?? 0}
              successRate={queue?.successRate ?? 0}
              withVisa={queue?.withVisa ?? 0}
              withSalary={queue?.withSalary ?? 0}
              analyzedCount={queue?.analyzedCount ?? 0}
            />
            <IntelPanel
              topCompany={companies?.topCompanies?.[0]?.company}
              topSkill={skills?.techSkills?.[0]?.keyword}
              topCity={locations?.locations?.[0]?.city}
              sponsorshipRate={visa?.sponsorshipRate}
              avgJobsPerDay={overview?.avgJobsPerDay}
              completionRate={overview?.completionRate}
              totalJobs={overview?.total}
            />
          </div>
        </main>

        {/* Footer */}
        <footer
          style={{
            borderTop: "1px solid var(--border)",
            padding: "8px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "8px",
            color: "var(--muted)",
            letterSpacing: "0.1em",
          }}
        >
          <span>GOONEDIN ANALYTICS · MARKET INTELLIGENCE TERMINAL</span>
          <span>UNIQUE JOBS · AUTO-REFRESHES EVERY 60S</span>
        </footer>
      </div>
    </>
  );
}
