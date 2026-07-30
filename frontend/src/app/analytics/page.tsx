"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { useJobsStore } from "@/store/jobs";
import { useShallow } from "zustand/react/shallow";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { AICompanion } from "@/components/AICompanion";
import { Job } from "@/store/jobs";
import { Kicker } from "@/components/ds";

// ── Stat card wrapper ─────────────────────────────────────────────────────────
function StatCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[4px] border border-hairline bg-paper-card px-4 py-3.5">
      <Kicker as="h2" className="mb-3 border-b border-hairline pb-2">
        {title}
      </Kicker>
      {children}
    </section>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function NoData() {
  return <Kicker>No data yet</Kicker>;
}

// ── Top Companies ─────────────────────────────────────────────────────────────
function TopCompanies({ jobs }: { jobs: Job[] }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const job of jobs) {
      const c = job.company?.trim();
      if (!c) continue;
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [jobs]);

  const max = counts[0]?.[1] ?? 1;

  if (counts.length === 0) return <NoData />;

  return (
    <div className="flex flex-col gap-2">
      {counts.map(([company, count], index) => (
        <div key={company}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="max-w-[70%] truncate font-sans text-[13px] text-ink-2">
              {company}
            </span>
            <span className="shrink-0 font-serif text-[15px] font-semibold tabular-nums text-ink">
              {count}
            </span>
          </div>
          <div className="h-[3px] w-full bg-hairline">
            <div
              className={`h-full transition-[width] duration-[400ms] ${
                index === 0 ? "bg-brick" : "bg-ink-faint"
              }`}
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Source Breakdown ──────────────────────────────────────────────────────────
function SourceBreakdown({ jobs }: { jobs: Job[] }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const job of jobs) {
      const s = job.source?.trim() || "Unknown";
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [jobs]);

  const total = jobs.length || 1;

  if (counts.length === 0) return <NoData />;

  return (
    <div className="flex flex-col gap-2">
      {counts.map(([source, count], index) => {
        const pct = Math.round((count / total) * 100);
        return (
          <div key={source} className="flex items-center gap-3">
            <span className="w-20 shrink-0 truncate font-mono text-[11px] uppercase tracking-[0.09em] text-ink-2">
              {source}
            </span>
            <div className="relative h-1 flex-1 bg-hairline">
              <div
                className={`absolute left-0 top-0 h-full transition-[width] duration-[400ms] ${
                  index === 0 ? "bg-brick" : "bg-ink-faint"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-muted">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Work Model Breakdown ──────────────────────────────────────────────────────
function WorkModelBreakdown({ jobs }: { jobs: Job[] }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const job of jobs) {
      const raw = job.work_model?.trim().toLowerCase();
      let label = "UNSPECIFIED";
      if (!raw) {
        label = "UNSPECIFIED";
      } else if (raw.includes("remote")) {
        label = "REMOTE";
      } else if (raw.includes("hybrid")) {
        label = "HYBRID";
      } else if (raw.includes("on") || raw.includes("office")) {
        label = "ON-SITE";
      } else {
        label = raw.toUpperCase();
      }
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    const order = ["REMOTE", "HYBRID", "ON-SITE", "UNSPECIFIED"];
    const result = Array.from(map.entries()).sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return result;
  }, [jobs]);

  if (counts.length === 0) return <NoData />;

  return (
    <div className="flex flex-wrap gap-2">
      {counts.map(([model, count]) => (
        <div
          key={model}
          className="flex min-w-[76px] flex-col items-center gap-0.5 rounded-[4px] border border-hairline bg-paper-sunk px-3 py-2"
        >
          <span
            className={`font-serif text-[22px] font-semibold leading-none tabular-nums ${
              model === "REMOTE" ? "text-forest" : "text-ink"
            }`}
          >
            {count}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
            {model}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Summary stat strip ────────────────────────────────────────────────────────
type StatTone = "ink" | "brick" | "forest";

const statToneClass: Record<StatTone, string> = {
  ink: "text-ink",
  brick: "text-brick",
  forest: "text-forest",
};

function SummaryStat({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string | number;
  tone?: StatTone;
}) {
  return (
    <div className="flex flex-col gap-1 border-r border-hairline px-5 py-3">
      <Kicker>{label}</Kicker>
      <span
        className={`font-serif text-[28px] font-semibold leading-none tabular-nums ${statToneClass[tone]}`}
      >
        {value}
      </span>
    </div>
  );
}

// ── Analytics Page ────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const jobs = useJobsStore(useShallow((state) => state.jobs));

  const stats = useMemo(() => {
    const withSalary = jobs.filter((j) => j.salary).length;
    const remote = jobs.filter((j) =>
      j.work_model?.toLowerCase().includes("remote")
    ).length;
    const uniqueCompanies = new Set(jobs.map((j) => j.company)).size;
    return { withSalary, remote, uniqueCompanies };
  }, [jobs]);

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      {/* Header */}
      <header className="shell-header bg-paper-card">
        <div className="shell-header-inner">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
              className="shell-back"
            >
              <ArrowLeft className="size-[14px]" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-serif text-[19px] font-semibold leading-none text-ink">
                Analytics
              </h1>
              <Kicker className="mt-1">Job market intelligence</Kicker>
            </div>
          </div>

          <span className="shrink-0 rounded-[4px] border border-hairline bg-paper-card px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.09em] text-ink-2">
            {jobs.length} jobs loaded
          </span>
        </div>
      </header>

      {/* Summary stat strip */}
      <div className="flex shrink-0 overflow-x-auto border-b border-hairline bg-paper-card scrollbar-hide">
        <SummaryStat label="Total jobs" value={jobs.length} />
        <SummaryStat label="Companies" value={stats.uniqueCompanies} tone="brick" />
        <SummaryStat label="Remote roles" value={stats.remote} tone="forest" />
        <SummaryStat label="With salary" value={stats.withSalary} />
      </div>

      {/* Chart band leads; AI supports below on narrow, beside on wide */}
      <main className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto border-b border-hairline p-4 sm:p-5 xl:border-b-0 xl:border-r">
          <div className="min-h-[280px]">
            <AnalyticsPanel jobs={jobs} />
          </div>

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            <StatCard title="Top companies">
              <TopCompanies jobs={jobs} />
            </StatCard>

            <StatCard title="Source breakdown">
              <SourceBreakdown jobs={jobs} />
            </StatCard>

            <StatCard title="Work model">
              <WorkModelBreakdown jobs={jobs} />
            </StatCard>
          </div>
        </div>

        <div className="flex min-h-[320px] flex-col xl:min-h-0 xl:w-[380px] xl:shrink-0">
          <AICompanion />
        </div>
      </main>
    </div>
  );
}
