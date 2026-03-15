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
import SkillMomentumPanel from "@/components/SkillMomentumPanel";
import ExperienceDistribution from "@/components/ExperienceDistribution";
import SalaryByLocationChart from "@/components/SalaryByLocationChart";
import ScanlineOverlay from "@/components/ScanlineOverlay";
import BootSequence from "@/components/BootSequence";
import PanelHint from "@/components/PanelHint";
import EmptyPanel from "@/components/EmptyPanel";
import SectionGuide from "@/components/SectionGuide";

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
interface SkillMomentum {
  rising: { skill: string; recent: number; prior: number; delta: number }[];
  declining: { skill: string; recent: number; prior: number; delta: number }[];
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
    skillMomentum,
    experience,
    salaryByLocation,
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
  ]);

  const sparkline = (timeline?.timeline ?? []).map((d) => ({ v: d.count }));

  const hasJobs = (overview?.total ?? 0) > 0;

  return (
    <>
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

          <SectionGuide label="VOLUME" description="How many jobs are being posted over time" />

          {/* Row 2: Volume + Sources */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "12px",
              height: "240px",
            }}
          >
            {(timeline?.timeline ?? []).length > 0 ? (
              <JobVolumeChart data={timeline?.timeline ?? []} />
            ) : (
              <EmptyPanel
                title="Job Volume"
                message="Awaiting timeline data"
                suggestion="This chart shows daily job posting volume with 7/14/30/90-day range filters."
              />
            )}
          </div>

          <SectionGuide label="WHO & WHERE" description="Top employers and geographic hotspots" />

          {/* Row 3: Companies + Locations */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              height: "300px",
            }}
          >
            {(companies?.topCompanies ?? []).length > 0 ? (
              <CompanyLeaderboard data={companies?.topCompanies ?? []} />
            ) : (
              <EmptyPanel
                title="Top Companies"
                message="No company data yet"
                suggestion="Shows which employers post the most jobs. Requires AI analysis."
              />
            )}
            {(locations?.locations ?? []).length > 0 ? (
              <LocationChart data={locations?.locations ?? []} />
            ) : (
              <EmptyPanel
                title="Locations"
                message="No location data yet"
                suggestion="Geographic distribution of job postings. Populated from AI analysis."
              />
            )}
          </div>

          <SectionGuide label="SKILLS" description="Technical skills, nice-to-haves, and posting patterns" />

          {/* Row 4: Skills + Good-to-Have + Heatmap */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "12px",
              height: "280px",
            }}
          >
            {(skills?.techSkills ?? []).length > 0 ? (
              <SkillsFrequency data={skills?.techSkills ?? []} />
            ) : (
              <EmptyPanel
                title="Technical Skills"
                message="No skill data yet"
                suggestion="Top programming languages, frameworks, and tools extracted from job descriptions."
              />
            )}
            {(skills?.goodToHave ?? []).length > 0 ? (
              <GoodToHavePanel data={skills?.goodToHave ?? []} />
            ) : (
              <EmptyPanel
                title="Good to Have"
                message="No data yet"
                suggestion="Nice-to-have skills that appear frequently but aren't hard requirements."
              />
            )}
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
            {(skills?.softSkills ?? []).length > 0 ? (
              <SoftSkillsPanel data={skills?.softSkills ?? []} />
            ) : (
              <EmptyPanel
                title="Soft Skills"
                message="No data yet"
                suggestion="Communication, leadership, and other soft skills from job descriptions."
              />
            )}
            {(skills?.cooccurrencePairs ?? []).length > 0 ? (
              <SkillCooccurrence data={skills?.cooccurrencePairs ?? []} />
            ) : (
              <EmptyPanel
                title="Skill Co-occurrence"
                message="No data yet"
                suggestion="Shows which skills are commonly requested together in the same posting."
              />
            )}
          </div>

          {/* Row 5b: Skill Momentum */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "12px",
              height: "280px",
            }}
          >
            {(skillMomentum?.rising ?? []).length > 0 || (skillMomentum?.declining ?? []).length > 0 ? (
              <SkillMomentumPanel
                rising={skillMomentum?.rising ?? []}
                declining={skillMomentum?.declining ?? []}
              />
            ) : (
              <EmptyPanel
                title="Skill Momentum"
                message="Awaiting 14+ days of data"
                suggestion="Shows which skills are rising or falling in demand compared to the prior 2 weeks."
              />
            )}
          </div>

          <SectionGuide label="TIMING & LEVELS" description="Seniority distribution, experience demand, and when jobs get posted" />

          {/* Row 6: Seniority + Weekday + Time Distribution */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "300px 1fr 1fr",
              gap: "12px",
              height: "240px",
            }}
          >
            {(seniority?.seniority ?? []).length > 0 ? (
              <SeniorityChart data={seniority?.seniority ?? []} />
            ) : (
              <EmptyPanel
                title="Seniority"
                message="No data yet"
                suggestion="Entry, mid, senior, and lead-level role distribution."
              />
            )}
            {(weekday?.weekday ?? []).length > 0 ? (
              <WeekdayChart
                data={weekday?.weekday ?? []}
                peakDay={weekday?.peakDay ?? null}
              />
            ) : (
              <EmptyPanel
                title="Posting Days"
                message="No data yet"
                suggestion="Which days of the week have the most job postings."
              />
            )}
            <TimeDistributionChart fallbackData={companies?.hourlyDistribution ?? []} />
          </div>

          {/* Row 6b: Experience Demand */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              height: "240px",
            }}
          >
            {(experience?.distribution ?? []).some(d => d.count > 0) ? (
              <ExperienceDistribution
                distribution={experience?.distribution ?? []}
                matched={experience?.matched ?? 0}
                total={experience?.total ?? 0}
                matchRate={experience?.matchRate ?? 0}
              />
            ) : (
              <EmptyPanel
                title="Experience Demand"
                message="No experience data yet"
                suggestion="Shows years-of-experience requirements extracted from job descriptions."
              />
            )}
            {(seniority?.jobFunctions ?? []).length > 0 ? (
              <JobFunctionsChart data={seniority?.jobFunctions ?? []} />
            ) : (
              <EmptyPanel
                title="Job Functions"
                message="No data yet"
                suggestion="Engineering, product, design, and other function distribution."
              />
            )}
          </div>

          <SectionGuide label="VISA & LOCATION PAY" description="Sponsorship rates and salary by city" />

          {/* Row 7: Visa + Salary by Location */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              height: "260px",
            }}
          >
            {(visa?.visa ?? []).length > 0 ? (
              <VisaStats
                data={visa?.visa ?? []}
                sponsorshipRate={visa?.sponsorshipRate ?? 0}
                total={visa?.total ?? 0}
              />
            ) : (
              <EmptyPanel
                title="Visa Sponsorship"
                message="No visa data yet"
                suggestion="Shows the proportion of jobs offering H-1B or other visa sponsorship."
              />
            )}
            {(salaryByLocation?.cities ?? []).length > 0 ? (
              <SalaryByLocationChart cities={salaryByLocation?.cities ?? []} />
            ) : (
              <EmptyPanel
                title="Salary x Location"
                message="No location salary data yet"
                suggestion="Median salary by city. Requires 3+ salary-disclosed jobs per location."
              />
            )}
          </div>

          <SectionGuide label="COMPENSATION" description="Salary ranges and title keyword analysis" />

          {/* Row 8: Salary + Title Keywords */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: "12px",
              height: "260px",
            }}
          >
            {(salary?.buckets ?? []).length > 0 ? (
              <SalaryChart
                buckets={salary?.buckets ?? []}
                listedRate={salary?.listedRate ?? 0}
                listedCount={salary?.listedCount ?? 0}
                medianEstimate={salary?.medianEstimate ?? null}
              />
            ) : (
              <EmptyPanel
                title="Salary Ranges"
                message="No salary data yet"
                suggestion="Salary distribution buckets. Only available for postings that disclose compensation."
              />
            )}
            {(seniority?.titleKeywords ?? []).length > 0 ? (
              <TitleKeywordsPanel data={seniority?.titleKeywords ?? []} />
            ) : (
              <EmptyPanel
                title="Title Keywords"
                message="No data yet"
                suggestion="Most common words in job titles across all postings."
              />
            )}
          </div>

          <SectionGuide label="SYSTEM" description="Pipeline health and AI-generated market insights" />

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
