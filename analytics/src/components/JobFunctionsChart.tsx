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

interface Props {
  data: { function: string; count: number; color: string }[];
}

export default function JobFunctionsChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const top = data.slice(0, 8);

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Job Functions</div>
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
                data={top}
                dataKey="count"
                nameKey="function"
                cx="50%"
                cy="50%"
                innerRadius="45%"
                outerRadius="80%"
                paddingAngle={2}
                animationDuration={CHART_ANIM_MS}
              >
                {top.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="var(--bg-panel)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                content={
                  <ChartTooltip
                    formatLabel={(p) => p?.function ?? ""}
                    formatValue={(v) => `${v} jobs`}
                  />
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
          {top.map((d) => (
            <div key={d.function} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
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
                }}
              >
                {d.function}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--muted)",
                  flexShrink: 0,
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
