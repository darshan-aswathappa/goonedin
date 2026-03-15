"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";

interface SeniorityBucket {
  level: string;
  count: number;
  color: string;
}

interface Props {
  data: SeniorityBucket[];
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

export default function SeniorityChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const topLevel = data[0];

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Seniority Breakdown</div>
      <div
        style={{
          padding: "12px",
          height: "calc(100% - 37px)",
          display: "flex",
          gap: "12px",
          alignItems: "center",
        }}
      >
        {/* Donut */}
        <div style={{ flex: "0 0 110px", height: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="level"
                cx="50%"
                cy="50%"
                innerRadius="45%"
                outerRadius="80%"
                paddingAngle={2}
                animationDuration={600}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.color}
                    stroke="var(--bg-panel)"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend + top stat */}
        <div style={{ flex: "0 0 auto", minWidth: 0, maxWidth: "180px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {topLevel && (
            <div style={{ marginBottom: "6px" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "16px",
                  fontWeight: 700,
                  color: topLevel.color,
                  lineHeight: 1,
                }}
              >
                {total > 0 ? Math.round((topLevel.count / total) * 100) : 0}%
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "7px",
                  color: "var(--muted)",
                  letterSpacing: "0.12em",
                  marginTop: "2px",
                }}
              >
                {topLevel.level.toUpperCase()}
              </div>
            </div>
          )}
          {data.map((d) => (
            <div key={d.level} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  background: d.color,
                  borderRadius: "1px",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--text-dim)",
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginRight: "8px",
                }}
              >
                {d.level}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--muted)",
                  flexShrink: 0,
                }}
              >
                {d.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
