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
          <div className="stat-value" style={{ fontSize: "36px", color: "var(--teal)" }}>
            {sponsorshipRate}%
          </div>
          <div className="stat-label" style={{ letterSpacing: "0.15em", marginTop: "5px", lineHeight: 1.5 }}>
            SPONSORSHIP
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
                animationDuration={CHART_ANIM_MS}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="var(--bg-panel)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                content={
                  <ChartTooltip
                    formatLabel={(p) => p?.label ?? ""}
                    formatValue={(v) => `${v} jobs`}
                  />
                }
              />
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
