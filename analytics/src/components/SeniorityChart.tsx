"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import ChartTooltip from "./ChartTooltip";
import { CHART_ANIM_MS } from "@/lib/tokens";

interface SeniorityBucket {
  level: string;
  count: number;
  color: string;
}

interface Props {
  data: SeniorityBucket[];
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
                animationDuration={CHART_ANIM_MS}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="var(--bg-panel)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                content={
                  <ChartTooltip
                    formatLabel={(p) => p?.level ?? ""}
                    formatValue={(v) => `${v} jobs`}
                  />
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ flex: "0 0 auto", minWidth: 0, maxWidth: "180px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {topLevel && (
            <div style={{ marginBottom: "6px" }}>
              <div className="stat-value" style={{ fontSize: "16px", color: topLevel.color }}>
                {total > 0 ? Math.round((topLevel.count / total) * 100) : 0}%
              </div>
              <div className="stat-label">{topLevel.level.toUpperCase()}</div>
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
