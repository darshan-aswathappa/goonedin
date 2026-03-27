"use client";

import { useState, useEffect, useCallback } from "react";
import TabNav from "@/components/TabNav";
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
import SalaryByJobFunctionChart from "@/components/SalaryByJobFunctionChart";
import HiringVelocityChart from "@/components/HiringVelocityChart";
import QueueHealth from "@/components/QueueHealth";
import SkillCooccurrence from "@/components/SkillCooccurrence";
import TimeDistributionChart from "@/components/TimeDistributionChart";
import SkillMomentumTable from "@/components/SkillMomentumTable";
import ExperienceDistribution from "@/components/ExperienceDistribution";
import SalaryByLocationChart from "@/components/SalaryByLocationChart";
import EmptyPanel from "@/components/EmptyPanel";
import SafePanel from "@/components/SafePanel";

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

interface Props {
  overview: Overview | null;
  companies: Companies | null;
  skills: Skills | null;
  timeline: Timeline | null;
  locations: Locations | null;
  visa: Visa | null;
  salary: Salary | null;
  seniority: Seniority | null;
  weekday: Weekday | null;
  queue: Queue | null;
  skillMomentum: SkillMomentum | null;
  experience: Experience | null;
  salaryByLocation: SalaryByLocation | null;
  hiringVelocity: HiringVelocity | null;
  salaryByFunction: SalaryByFunction | null;
}

function StatusBar() {
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="status-bar">
      {/* Left cluster */}
      <span style={{ color: "var(--teal)", fontWeight: 700, letterSpacing: "0.1em" }}>
        HIREFEED ANALYTICS v2.0
      </span>
      <span style={{ color: "var(--border-bright)" }}>|</span>
      <span>
        DATA:{" "}
        <span style={{ color: "var(--green)", fontWeight: 600 }}>LIVE</span>
      </span>
      <span style={{ color: "var(--border-bright)" }}>|</span>
      <span>
        LATENCY:{" "}
        <span style={{ color: "var(--green)" }}>&lt;50ms</span>
      </span>

      {/* Center */}
      <span style={{ flex: 1, textAlign: "center" }}>
        LAST UPD:{" "}
        <span style={{ color: "var(--text-dim)" }}>{currentTime}</span>
      </span>

      {/* Right cluster */}
      <span>
        <span style={{ color: "var(--border-bright)" }}>[ESC]</span> CLEAR
      </span>
      <span style={{ color: "var(--border-bright)" }}>|</span>
      <span>
        <span style={{ color: "var(--border-bright)" }}>[⌘K]</span> COMMAND
      </span>
      <span style={{ color: "var(--border-bright)" }}>|</span>
      <span>
        <span style={{ color: "var(--border-bright)" }}>[R]</span> REFRESH
      </span>
    </div>
  );
}

export default function DashboardTabs({
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
}: Props) {
  const [activeTab, setActiveTab] = useState("market");
  // Track which tabs have been visited so we can keep them mounted (avoids
  // expensive remounts — especially LocationChart re-fetching geo.json).
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(
    () => new Set(["market"]),
  );

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const tabId = (e as CustomEvent<string>).detail;
      if (tabId) handleTabChange(tabId);
    };
    window.addEventListener("dashboard:switchtab", handler);
    return () => window.removeEventListener("dashboard:switchtab", handler);
  }, [handleTabChange]);

  const sparkline = (timeline?.timeline ?? []).map((d) => ({ v: d.count }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {/* KPI strip */}
      <div
        style={{
          padding: "20px 20px 0",
          background: "var(--bg-root)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="kpi-grid">
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
            subLabel={`${Math.round(overview?.completionRate ?? 0)}% of jobs analyzed`}
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
            subLabel="% with salary listed"
            accent="teal"
            delay={240}
          />
        </div>
      </div>

      {/* Tab nav */}
      <TabNav active={activeTab} onChange={handleTabChange} />

      {/* Tab content */}
      <main
        className="dashboard-main"
        style={{
          flex: 1,
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* Each tab is lazy-mounted on first visit, then kept alive hidden.
            This prevents expensive remounts (e.g. LocationChart re-fetching
            geo.json) on every tab switch. */}

        <div style={{ display: activeTab === "market" ? undefined : "none" }}>
          {/* Job Volume full width */}
          <div className="chart-row chart-row--one" style={{ height: "272px" }}>
            {(timeline?.timeline ?? []).length > 0 ? (
              <SafePanel title="Job Volume">
                <JobVolumeChart data={timeline?.timeline ?? []} />
              </SafePanel>
            ) : (
              <EmptyPanel
                title="Job Volume"
                message="No timeline data yet"
                suggestion="This chart shows daily job posting volume with 7/14/30/90-day range filters."
              />
            )}
          </div>

          {/* Weekday | Time Distribution | 24h Heatmap */}
          <div className="chart-row chart-row--three" style={{ height: "248px", marginTop: "16px" }}>
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
            <SafePanel title="Posting Times">
              <TimeDistributionChart fallbackData={companies?.hourlyDistribution ?? []} />
            </SafePanel>
            <SafePanel title="24h Posting Activity">
              <PostingHeatmap data={companies?.hourlyDistribution ?? []} />
            </SafePanel>
          </div>
        </div>

        {visitedTabs.has("skills") && (
          <div style={{ display: activeTab === "skills" ? undefined : "none" }}>
            {/* Tech Skills | Good-to-Have | 24h Posting Heatmap */}
            <div className="chart-row chart-row--three" style={{ height: "296px" }}>
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
              <SafePanel title="24h Posting Activity">
                <PostingHeatmap data={companies?.hourlyDistribution ?? []} />
              </SafePanel>
            </div>

            {/* Soft Skills | Skill Co-occurrence */}
            <div className="chart-row chart-row--one-two" style={{ height: "288px", marginTop: "16px" }}>
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

            {/* Skill Momentum Table */}
            <div className="chart-row chart-row--one" style={{ minHeight: "256px", marginTop: "16px" }}>
              {(skillMomentum?.skills ?? []).length > 0 ? (
                <SkillMomentumTable
                  skills={skillMomentum?.skills ?? []}
                  dailyJobs={skillMomentum?.dailyJobs ?? []}
                  dateRange={skillMomentum?.dateRange ?? null}
                />
              ) : (
                <EmptyPanel
                  title="Skill Momentum"
                  message="No skill data yet"
                  suggestion="Shows top 10 technical skills ranked by momentum with daily sparkline trends."
                />
              )}
            </div>
          </div>
        )}

        {visitedTabs.has("companies") && (
          <div style={{ display: activeTab === "companies" ? undefined : "none" }}>
            {/* Company Leaderboard | Hiring Velocity */}
            <div className="chart-row chart-row--one-two" style={{ height: "300px" }}>
              {(companies?.topCompanies ?? []).length > 0 ? (
                <CompanyLeaderboard data={companies?.topCompanies ?? []} />
              ) : (
                <EmptyPanel
                  title="Top Companies"
                  message="No company data yet"
                  suggestion="Shows which employers post the most jobs. Requires AI analysis."
                />
              )}
              <HiringVelocityChart
                companies={hiringVelocity?.companies ?? []}
                data={hiringVelocity?.data ?? []}
              />
            </div>

            {/* Market Intelligence | Queue Health */}
            <div className="chart-row chart-row--two-one" style={{ height: "176px", marginTop: "16px" }}>
              <IntelPanel
                topCompany={companies?.topCompanies?.[0]?.company}
                topSkill={skills?.techSkills?.[0]?.keyword}
                topCity={locations?.locations?.[0]?.city}
                sponsorshipRate={visa?.sponsorshipRate}
                avgJobsPerDay={overview?.avgJobsPerDay}
                completionRate={overview?.completionRate}
                totalJobs={overview?.total}
              />
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
            </div>
          </div>
        )}

        {visitedTabs.has("pipeline") && (
          <div style={{ display: activeTab === "pipeline" ? undefined : "none" }}>
            {/* Seniority | Weekday | Time Distribution */}
            <div className="chart-row chart-row--fixed-three" style={{ height: "256px" }}>
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
              <SafePanel title="Posting Times">
                <TimeDistributionChart fallbackData={companies?.hourlyDistribution ?? []} />
              </SafePanel>
            </div>

            {/* Experience Distribution | Job Functions | Salary by Function */}
            <div className="chart-row chart-row--three" style={{ height: "248px", marginTop: "16px" }}>
              {(experience?.distribution ?? []).some((d) => d.count > 0) ? (
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
              {(salaryByFunction?.functions ?? []).length > 0 ? (
                <SalaryByJobFunctionChart data={salaryByFunction?.functions ?? []} />
              ) : (
                <EmptyPanel
                  title="Salary by Function"
                  message="No salary data by function yet"
                  suggestion="Median salary per engineering function. Requires jobs with salary disclosed."
                />
              )}
            </div>

            {/* Salary | Title Keywords */}
            <div className="chart-row chart-row--one-two" style={{ height: "276px", marginTop: "16px" }}>
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
          </div>
        )}

        {visitedTabs.has("geo") && (
          <div style={{ display: activeTab === "geo" ? undefined : "none" }}>
            {/* Location Chart | Visa Stats */}
            <div className="chart-row chart-row--two" style={{ height: "316px" }}>
              {(locations?.locations ?? []).length > 0 ? (
                <SafePanel title="Locations">
                  <LocationChart data={locations?.locations ?? []} />
                </SafePanel>
              ) : (
                <EmptyPanel
                  title="Locations"
                  message="No location data yet"
                  suggestion="Geographic distribution of job postings. Populated from AI analysis."
                />
              )}
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
            </div>

            {/* Salary by Location full width */}
            <div className="chart-row chart-row--one" style={{ height: "272px", marginTop: "16px" }}>
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
          </div>
        )}
      </main>

      {/* Fixed status bar at bottom of viewport */}
      <StatusBar />

      {/* Spacer so the last row of content isn't hidden behind the fixed status bar */}
      <div style={{ height: "20px" }} />
    </div>
  );
}
