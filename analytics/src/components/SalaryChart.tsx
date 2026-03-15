"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import ChartTooltip from "./ChartTooltip";
import { AXIS_TICK_SM, BAR_CURSOR, CHART_ANIM_MS } from "@/lib/tokens";

interface Props {
  buckets: { label: string; count: number }[];
  listedRate: number;
  listedCount: number;
  medianEstimate: number | null;
}

export default function SalaryChart({
  buckets,
  listedRate,
  listedCount,
  medianEstimate,
}: Props) {
  const max = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">
        Salary Distribution
        <span
          style={{
            marginLeft: "auto",
            color: "var(--teal)",
            fontSize: "9px",
            fontWeight: 700,
          }}
        >
          {listedRate}% SHOW SALARY
        </span>
      </div>
      <div
        style={{
          padding: "10px 12px 0",
          height: "calc(100% - 37px)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {medianEstimate && (
          <div style={{ display: "flex", gap: "16px", marginBottom: "4px" }}>
            <div>
              <div className="stat-value" style={{ fontSize: "18px", color: "var(--green)" }}>
                ${Math.round(medianEstimate / 1000)}K
              </div>
              <div className="stat-label">MEDIAN SALARY</div>
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: "18px", color: "var(--text-dim)" }}>
                {listedCount.toLocaleString()}
              </div>
              <div className="stat-label">JOBS WITH SALARY</div>
            </div>
          </div>
        )}

        <div style={{ flex: 1 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                tick={AXIS_TICK_SM}
                axisLine={false}
                tickLine={false}
                domain={[0, max]}
              />
              <YAxis
                dataKey="label"
                type="category"
                tick={{ ...AXIS_TICK_SM, fill: "var(--text-dim)" }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip
                content={<ChartTooltip formatLabel={(p) => p?.label ?? ""} />}
                cursor={BAR_CURSOR}
              />
              <Bar dataKey="count" radius={[0, 2, 2, 0]} animationDuration={CHART_ANIM_MS}>
                {buckets.map((_, i) => (
                  <Cell
                    key={i}
                    fill={
                      i === Math.floor(buckets.length / 2)
                        ? "var(--green)"
                        : i < Math.floor(buckets.length / 2)
                        ? "var(--blue)"
                        : "var(--teal)"
                    }
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
