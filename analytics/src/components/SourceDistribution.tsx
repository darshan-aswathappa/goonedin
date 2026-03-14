"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";

interface Props {
  data: { source: string; count: number; color: string }[];
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
      <div style={{ color: payload[0]?.payload?.color ?? "var(--teal)" }}>
        {payload[0]?.name}
      </div>
      <div style={{ color: "var(--text)", fontWeight: 700 }}>
        {payload[0]?.value?.toLocaleString()} jobs
      </div>
    </div>
  );
}

export default function SourceDistribution({ data }: Props) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Sources</div>
      <div
        style={{
          padding: "12px",
          height: "calc(100% - 37px)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {/* Donut */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="source"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={2}
                animationDuration={600}
                animationEasing="ease-out"
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
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {data.map((d) => (
            <div key={d.source} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  background: d.color,
                  borderRadius: "1px",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-dim)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {d.source}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--muted)",
                }}
              >
                {total > 0 ? Math.round((d.count / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
