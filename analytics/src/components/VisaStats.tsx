"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";

interface VisaBucket {
  label: string;
  count: number;
  color: string;
}

interface Props {
  data: VisaBucket[];
  sponsorshipRate: number;
  total: number;
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border-bright)",
        padding: "7px 10px",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        borderRadius: "var(--radius)",
      }}
    >
      <div style={{ color: payload[0]?.payload?.color }}>{payload[0]?.name}</div>
      <div style={{ color: "var(--text)", fontWeight: 700 }}>{payload[0]?.value} jobs</div>
    </div>
  );
}

export default function VisaStats({ data, sponsorshipRate, total }: Props) {
  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Visa Sponsorship Analysis</div>
      <div
        style={{
          padding: "12px",
          height: "calc(100% - 37px)",
          display: "flex",
          gap: "16px",
          alignItems: "center",
        }}
      >
        {/* Big callout */}
        <div style={{ flexShrink: 0, textAlign: "center", width: "90px" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "36px",
              fontWeight: 700,
              color: "var(--teal)",
              lineHeight: 1,
            }}
          >
            {sponsorshipRate}%
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "7px",
              color: "var(--muted)",
              letterSpacing: "0.15em",
              marginTop: "5px",
              lineHeight: 1.5,
            }}
          >
            SPONSOR
            <br />
            RATE
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "8px",
              color: "var(--muted)",
              marginTop: "6px",
            }}
          >
            {total} analyzed
          </div>
        </div>

        {/* Donut */}
        <div style={{ flex: 1, minWidth: 0, height: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius="50%"
                outerRadius="80%"
                paddingAngle={2}
                animationDuration={600}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="var(--bg-panel)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: "5px", flexShrink: 0 }}>
          {data.map((d) => (
            <div key={d.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div
                style={{
                  width: "7px",
                  height: "7px",
                  background: d.color,
                  borderRadius: "1px",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                {d.label}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--muted)" }}>
                {d.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
