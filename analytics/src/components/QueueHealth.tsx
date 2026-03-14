"use client";

interface Props {
  completed: number;
  failed: number;
  pending: number;
  total: number;
  successRate: number;
  withVisa: number;
  withSalary: number;
  analyzedCount: number;
}

interface StatProps {
  label: string;
  value: string | number;
  accent?: string;
  sub?: string;
}

function Stat({ label, value, accent = "var(--teal)", sub }: StatProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "22px",
          fontWeight: 700,
          color: accent,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--muted)" }}>
          {sub}
        </div>
      )}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "7px",
          color: "var(--muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default function QueueHealth({
  completed,
  failed,
  pending,
  successRate,
  withVisa,
  withSalary,
  analyzedCount,
}: Props) {
  const visaPct = analyzedCount > 0 ? Math.round((withVisa / analyzedCount) * 100) : 0;
  const salaryPct = analyzedCount > 0 ? Math.round((withSalary / analyzedCount) * 100) : 0;

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Analysis Pipeline</div>
      <div
        style={{
          padding: "14px 16px",
          height: "calc(100% - 37px)",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px 16px",
          alignContent: "start",
        }}
      >
        <Stat label="Completed" value={completed} accent="var(--teal)" />
        <Stat label="Failed" value={failed} accent="var(--red, #ef4444)" />
        <Stat label="Success Rate" value={`${successRate}%`} accent="var(--green)" />
        <Stat
          label="Visa Extracted"
          value={`${visaPct}%`}
          accent="var(--blue)"
          sub={`${withVisa} jobs`}
        />
        <Stat
          label="Salary Extracted"
          value={`${salaryPct}%`}
          accent="var(--amber)"
          sub={`${withSalary} jobs`}
        />
        <Stat
          label="Pending"
          value={pending}
          accent="var(--muted)"
        />
      </div>
    </div>
  );
}
