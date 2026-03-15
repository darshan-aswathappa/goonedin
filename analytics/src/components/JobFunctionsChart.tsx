"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import ChartTooltip from "./ChartTooltip";
import { AXIS_TICK, CHART_ANIM_MS } from "@/lib/tokens";

interface Props {
  data: { function: string; count: number; color: string }[];
}

export default function JobFunctionsChart({ data }: Props) {
  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Job Function Breakdown</div>
      <div style={{ padding: "8px 4px", height: "calc(100% - 37px)" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 8 }}>
            <XAxis
              type="number"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              type="category"
              dataKey="function"
              width={78}
              tick={{ ...AXIS_TICK, fontSize: 10, fill: "var(--text-dim)" }}
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <Tooltip
              content={
                <ChartTooltip formatLabel={(p) => p?.function ?? ""} />
              }
              cursor={{ fill: "var(--border)", opacity: 0.2 }}
            />
            <Bar dataKey="count" radius={[0, 2, 2, 0]} maxBarSize={16} animationDuration={CHART_ANIM_MS}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
