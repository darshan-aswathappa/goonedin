"use client";

import { useMemo } from "react";
import { Job } from "@/store/jobs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface AnalyticsPanelProps {
  jobs: Job[];
}

// ── Shared paper tooltip style ───────────────────────────────────────────────
const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: "var(--paper-card)",
  border: "1px solid var(--border-strong)",
  borderRadius: "4px",
  color: "var(--ink)",
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  padding: "6px 10px",
  boxShadow: "none",
};

const TOOLTIP_CURSOR_FILL = { fill: "var(--accent-tint)" };

const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  color: "var(--ink)",
};

const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: "var(--ink-muted)",
  marginBottom: "2px",
};

const AXIS_TICK_STYLE = {
  fill: "var(--ink-muted)",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
};

const AXIS_LINE_STYLE = { stroke: "var(--border-hairline)" };

/** One accent, used with discipline: the peak bar is brick, the rest hairline. */
const BAR_COLOR_PEAK = "var(--accent)";
const BAR_COLOR_REST = "var(--border-strong)";

// ── Busiest Posting Days ─────────────────────────────────────────────────────
function BusiestPostingDays({ jobs }: { jobs: Job[] }) {
  const data = useMemo(() => {
    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const counts = Array(7).fill(0);

    for (const job of jobs) {
      const dateStr = job.posted_at || job.created_at;
      if (!dateStr) continue;
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) counts[d.getDay()]++;
      } catch {
        // skip malformed dates
      }
    }

    // Re-order Mon–Sun (typical work-week view)
    const ordered = [1, 2, 3, 4, 5, 6, 0];
    return ordered.map((idx) => ({
      day: DAY_NAMES[idx],
      count: counts[idx],
    }));
  }, [jobs]);

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  if (jobs.length === 0) {
    return <EmptyState />;
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="day"
          tick={AXIS_TICK_STYLE}
          axisLine={AXIS_LINE_STYLE}
          tickLine={false}
        />
        <YAxis
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          cursor={TOOLTIP_CURSOR_FILL}
          itemStyle={TOOLTIP_ITEM_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value) => [value, "Jobs"]}
        />
        <Bar dataKey="count" maxBarSize={32} radius={[2, 2, 0, 0]}>
          {data.map((entry, idx) => (
            <Cell
              key={idx}
              fill={entry.count === maxCount ? BAR_COLOR_PEAK : BAR_COLOR_REST}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Posting Times by Day ─────────────────────────────────────────────────────
function PostingTimesByDay({ jobs }: { jobs: Job[] }) {
  const data = useMemo(() => {
    // Bucket into 4-hour windows
    const LABELS = [
      "12–4am",
      "4–8am",
      "8am–12pm",
      "12–4pm",
      "4–8pm",
      "8pm–12am",
    ];
    const counts = Array(6).fill(0);

    for (const job of jobs) {
      const dateStr = job.posted_at || job.created_at;
      if (!dateStr) continue;
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const bucket = Math.floor(d.getHours() / 4);
          counts[bucket]++;
        }
      } catch {
        // skip
      }
    }

    return LABELS.map((label, idx) => ({ label, count: counts[idx] }));
  }, [jobs]);

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  if (jobs.length === 0) {
    return <EmptyState />;
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ ...AXIS_TICK_STYLE, fontSize: 9 }}
          axisLine={AXIS_LINE_STYLE}
          tickLine={false}
        />
        <YAxis
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          cursor={TOOLTIP_CURSOR_FILL}
          itemStyle={TOOLTIP_ITEM_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value) => [value, "Jobs"]}
        />
        <Bar dataKey="count" maxBarSize={36} radius={[2, 2, 0, 0]}>
          {data.map((entry, idx) => (
            <Cell
              key={idx}
              fill={entry.count === maxCount ? BAR_COLOR_PEAK : BAR_COLOR_REST}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Salary Distribution ──────────────────────────────────────────────────────
// Parses salary strings like "$80K–$120K", "$100,000 – $150,000", "80000-120000"
function parseSalaryMidpoint(salary: string): number | null {
  if (!salary) return null;
  // Strip everything except digits, hyphens, K/M
  const cleaned = salary.replace(/[^0-9kKmM\-–—\.]/g, " ");
  const tokens = cleaned.trim().split(/[\s\-–—]+/).filter(Boolean);

  const parseToken = (t: string): number | null => {
    const lower = t.toLowerCase();
    let num = parseFloat(lower.replace(/[km]/g, ""));
    if (isNaN(num)) return null;
    if (lower.endsWith("k")) num *= 1000;
    if (lower.endsWith("m")) num *= 1_000_000;
    // Heuristic: if number looks like it's in thousands already (< 1000), scale up
    if (num < 1000) num *= 1000;
    return num;
  };

  const values = tokens.map(parseToken).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return (values[0] + values[values.length - 1]) / 2;
}

function SalaryDistribution({ jobs }: { jobs: Job[] }) {
  const data = useMemo(() => {
    const BUCKETS = [
      { label: "<$60K", min: 0, max: 60_000 },
      { label: "$60–80K", min: 60_000, max: 80_000 },
      { label: "$80–100K", min: 80_000, max: 100_000 },
      { label: "$100–130K", min: 100_000, max: 130_000 },
      { label: "$130–160K", min: 130_000, max: 160_000 },
      { label: "$160–200K", min: 160_000, max: 200_000 },
      { label: ">$200K", min: 200_000, max: Infinity },
    ];

    const counts = Array(BUCKETS.length).fill(0);
    let parsedCount = 0;

    for (const job of jobs) {
      if (!job.salary) continue;
      const mid = parseSalaryMidpoint(job.salary);
      if (mid === null) continue;
      parsedCount++;
      for (let i = 0; i < BUCKETS.length; i++) {
        if (mid >= BUCKETS[i].min && mid < BUCKETS[i].max) {
          counts[i]++;
          break;
        }
      }
    }

    if (parsedCount === 0) return null;
    return BUCKETS.map((b, i) => ({ label: b.label, count: counts[i] }));
  }, [jobs]);

  if (!data) {
    return <EmptyState message="No salary data in current jobs." />;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ ...AXIS_TICK_STYLE, fontSize: 8 }}
          axisLine={AXIS_LINE_STYLE}
          tickLine={false}
        />
        <YAxis
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          cursor={TOOLTIP_CURSOR_FILL}
          itemStyle={TOOLTIP_ITEM_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value) => [value, "Jobs"]}
        />
        <Bar dataKey="count" maxBarSize={36} radius={[2, 2, 0, 0]}>
          {data.map((entry, idx) => (
            <Cell
              key={idx}
              fill={entry.count === maxCount ? BAR_COLOR_PEAK : BAR_COLOR_REST}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Shared empty state ───────────────────────────────────────────────────────
function EmptyState({
  message = "Open the live feed first — analytics use your current session.",
}: {
  message?: string;
}) {
  return (
    <div className="flex h-[160px] items-center justify-center rounded-[4px] bg-paper-sunk px-4 text-center">
      <span className="max-w-[36ch] font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
        {message}
      </span>
    </div>
  );
}

// ── Chart card wrapper ───────────────────────────────────────────────────────
function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[4px] border border-hairline bg-paper-card p-4">
      <h3 className="font-serif text-[15px] font-semibold leading-tight text-ink">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────
export function AnalyticsPanel({ jobs }: AnalyticsPanelProps) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <ChartCard title="Busiest Posting Days">
        <BusiestPostingDays jobs={jobs} />
      </ChartCard>

      <ChartCard title="Posting Times by Day">
        <PostingTimesByDay jobs={jobs} />
      </ChartCard>

      <ChartCard title="Salary Distribution">
        <SalaryDistribution jobs={jobs} />
      </ChartCard>
    </div>
  );
}
