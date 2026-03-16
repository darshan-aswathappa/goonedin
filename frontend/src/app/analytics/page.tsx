"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { useJobsStore } from "@/store/jobs";
import { useShallow } from "zustand/react/shallow";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { AICompanion } from "@/components/AICompanion";
import { Job } from "@/store/jobs";

// ── Stat card wrapper ─────────────────────────────────────────────────────────
function StatCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#080808",
        border: "1px solid #1c1c1c",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "#555555",
          textTransform: "uppercase",
          marginBottom: "12px",
          borderBottom: "1px solid #1c1c1c",
          paddingBottom: "8px",
        }}
      >
        // {title}
      </div>
      {children}
    </div>
  );
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

  if (counts.length === 0) {
    return (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "#555555",
          letterSpacing: "0.08em",
        }}
      >
        NO DATA YET
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {counts.map(([company, count]) => (
        <div key={company}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "3px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "#aaaaaa",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "70%",
              }}
            >
              {company}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "#ff8c00",
                letterSpacing: "0.06em",
                flexShrink: 0,
              }}
            >
              {count}
            </span>
          </div>
          <div
            style={{
              height: "2px",
              background: "#1c1c1c",
              width: "100%",
            }}
          >
            <div
              style={{
                height: "100%",
                background: "#ff8c00",
                width: `${(count / max) * 100}%`,
                transition: "width 0.4s ease",
              }}
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

  // Source colour mapping
  const SOURCE_COLORS: Record<string, string> = {
    LinkedIn: "#0077B5",
    GitHub: "#f0f0f0",
    MathWorks: "#FF6B35",
    Jobright: "#00B050",
  };

  if (counts.length === 0) {
    return (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "#555555",
          letterSpacing: "0.08em",
        }}
      >
        NO DATA YET
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {counts.map(([source, count]) => {
        const pct = Math.round((count / total) * 100);
        const color = SOURCE_COLORS[source] ?? "#aaaaaa";
        return (
          <div
            key={source}
            style={{ display: "flex", alignItems: "center", gap: "10px" }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "#aaaaaa",
                width: "80px",
                flexShrink: 0,
                letterSpacing: "0.04em",
              }}
            >
              {source}
            </span>
            <div
              style={{
                flex: 1,
                height: "4px",
                background: "#1c1c1c",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: "100%",
                  background: color,
                  width: `${pct}%`,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "#555555",
                width: "36px",
                textAlign: "right",
                flexShrink: 0,
                letterSpacing: "0.05em",
              }}
            >
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

  const MODEL_COLORS: Record<string, string> = {
    REMOTE: "#00B050",
    HYBRID: "#ffd700",
    "ON-SITE": "#ff8c00",
    UNSPECIFIED: "#555555",
  };

  if (counts.length === 0) {
    return (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "#555555",
          letterSpacing: "0.08em",
        }}
      >
        NO DATA YET
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {counts.map(([model, count]) => (
        <div
          key={model}
          style={{
            background: "#0d0d0d",
            border: `1px solid ${MODEL_COLORS[model] ?? "#2a2a2a"}30`,
            padding: "6px 12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2px",
            minWidth: "72px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "18px",
              fontWeight: 700,
              color: MODEL_COLORS[model] ?? "#aaaaaa",
              letterSpacing: "-0.02em",
            }}
          >
            {count}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "8px",
              color: "#555555",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            {model}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Summary stat strip ────────────────────────────────────────────────────────
function SummaryStat({
  label,
  value,
  color = "#f0f0f0",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        padding: "12px 20px",
        borderRight: "1px solid #1c1c1c",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          color: "#555555",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "22px",
          fontWeight: 700,
          color,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Analytics Page ────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const jobs = useJobsStore(useShallow((state) => state.jobs));
  const [backHovered, setBackHovered] = useState(false);

  const stats = useMemo(() => {
    const withSalary = jobs.filter((j) => j.salary).length;
    const remote = jobs.filter((j) =>
      j.work_model?.toLowerCase().includes("remote")
    ).length;
    const uniqueCompanies = new Set(jobs.map((j) => j.company)).size;
    return { withSalary, remote, uniqueCompanies };
  }, [jobs]);

  return (
    <div
      style={{ minHeight: "100vh", background: "#000000", display: "flex", flexDirection: "column" }}
    >
      {/* Header */}
      <header
        style={{
          height: "44px",
          background: "#060606",
          borderBottom: "1px solid #1c1c1c",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          position: "sticky",
          top: 0,
          zIndex: 40,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/">
            <div
              onMouseEnter={() => setBackHovered(true)}
              onMouseLeave={() => setBackHovered(false)}
              style={{
                width: "28px",
                height: "28px",
                border: backHovered ? "1px solid #ff8c00" : "1px solid #1c1c1c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: backHovered ? "#ff8c00" : "#555555",
                cursor: "pointer",
                transition: "border-color 0.1s, color 0.1s",
              }}
            >
              <ArrowLeft style={{ width: "14px", height: "14px" }} />
            </div>
          </Link>
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.2em",
                color: "#ff8c00",
                textTransform: "uppercase",
              }}
            >
              ANALYTICS // JOB MARKET INTELLIGENCE
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.12em",
                color: "#555555",
                marginTop: "1px",
              }}
            >
              REAL-TIME MARKET ANALYSIS · AI-POWERED INSIGHTS
            </div>
          </div>
        </div>

        {/* Jobs count badge */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "#ff8c00",
            border: "1px solid rgba(255,140,0,0.3)",
            padding: "3px 10px",
            letterSpacing: "0.1em",
          }}
        >
          {jobs.length} JOBS LOADED
        </div>
      </header>

      {/* Summary stat strip */}
      <div
        style={{
          background: "#060606",
          borderBottom: "1px solid #1c1c1c",
          display: "flex",
          flexShrink: 0,
        }}
      >
        <SummaryStat label="TOTAL JOBS" value={jobs.length} color="#f0f0f0" />
        <SummaryStat
          label="COMPANIES"
          value={stats.uniqueCompanies}
          color="#ff8c00"
        />
        <SummaryStat
          label="REMOTE ROLES"
          value={stats.remote}
          color="#00B050"
        />
        <SummaryStat
          label="WITH SALARY"
          value={stats.withSalary}
          color="#ffd700"
        />
      </div>

      {/* Main content: charts left, AI right */}
      <main
        className="analytics-main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          minHeight: 0,
        }}
      >
        {/* Left: Charts panel (60%) */}
        <div
          className="analytics-charts"
          style={{
            flex: "0 0 60%",
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            borderRight: "1px solid #1c1c1c",
          }}
        >
          {/* Drop-in charts from AnalyticsPanel */}
          <AnalyticsPanel jobs={jobs} />

          {/* Additional stat cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            <StatCard title="TOP COMPANIES">
              <TopCompanies jobs={jobs} />
            </StatCard>

            <StatCard title="SOURCE BREAKDOWN">
              <SourceBreakdown jobs={jobs} />
            </StatCard>

            <StatCard title="WORK MODEL">
              <WorkModelBreakdown jobs={jobs} />
            </StatCard>
          </div>
        </div>

        {/* Right: AI Companion (40%) */}
        <div
          className="analytics-ai"
          style={{
            flex: "0 0 40%",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <AICompanion />
        </div>
      </main>

      {/* Mobile layout override via inline media query workaround */}
      <style>{`
        @media (max-width: 768px) {
          .analytics-main {
            flex-direction: column !important;
          }
          .analytics-charts {
            flex: none !important;
            border-right: none !important;
            border-bottom: 1px solid #1c1c1c;
          }
          .analytics-ai {
            flex: none !important;
            min-height: 400px;
          }
        }
      `}</style>
    </div>
  );
}
