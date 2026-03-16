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

// ── Shared dark tooltip style ────────────────────────────────────────────────
const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: "#0d0d0d",
  border: "1px solid #2a2a2a",
  borderRadius: "2px",
  color: "#e8e8e8",
  fontFamily: "var(--font-mono, 'Courier New', monospace)",
  fontSize: "11px",
  fontWeight: 700,
  padding: "6px 10px",
  boxShadow: "none",
};

const TOOLTIP_CURSOR_FILL = { fill: "rgba(255, 90, 91, 0.08)" };

const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  color: "#e8e8e8",
};

const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: "#888888",
  marginBottom: "2px",
};

const AXIS_TICK_STYLE = {
  fill: "#888888",
  fontSize: 10,
  fontFamily: "var(--font-mono, 'Courier New', monospace)",
  fontWeight: 700,
};

const BAR_COLOR_PRIMARY = "#FF5A5B";
const BAR_COLOR_ACCENT = "#FFB30F";

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
    return <EmptyState message="No job data yet." />;
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="day"
          tick={AXIS_TICK_STYLE}
          axisLine={{ stroke: "#2a2a2a" }}
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
              fill={entry.count === maxCount ? BAR_COLOR_PRIMARY : "#2a2a2a"}
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
    return <EmptyState message="No job data yet." />;
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ ...AXIS_TICK_STYLE, fontSize: 9 }}
          axisLine={{ stroke: "#2a2a2a" }}
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
              fill={entry.count === maxCount ? BAR_COLOR_ACCENT : "#2a2a2a"}
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
          axisLine={{ stroke: "#2a2a2a" }}
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
              fill={entry.count === maxCount ? "#009063" : "#2a2a2a"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Shared empty state ───────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-[160px] flex items-center justify-center">
      <span className="terminal-label text-muted-foreground">{message}</span>
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
    <div className="brutal-border bg-card p-3 flex flex-col gap-2 brutal-shadow-responsive">
      <span className="terminal-label text-muted-foreground">{title}</span>
      {children}
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────
export function AnalyticsPanel({ jobs }: AnalyticsPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-3 mb-3">
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
