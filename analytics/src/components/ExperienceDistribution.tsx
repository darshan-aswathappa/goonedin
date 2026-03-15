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
import { AXIS_TICK, BAR_CURSOR, CHART_ANIM_MS } from "@/lib/tokens";

interface Props {
  distribution: { label: string; count: number }[];
  matched: number;
  total: number;
  matchRate: number;
}

export default function ExperienceDistribution({
  distribution,
  matched,
  matchRate,
}: Props) {
  const max = Math.max(...distribution.map((d) => d.count), 1);

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">
        Experience Demand
        <span
          style={{
            marginLeft: "auto",
            color: "var(--teal)",
            fontSize: "9px",
            fontWeight: 700,
          }}
        >
          {matchRate}% SPECIFY YOE
        </span>
      </div>
      <div className="panel-body-chart">
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={distribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={30} />
            <Tooltip content={<ChartTooltip />} cursor={BAR_CURSOR} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]} animationDuration={CHART_ANIM_MS}>
              {distribution.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.count === max
                      ? "var(--teal)"
                      : entry.count > max * 0.7
                      ? "var(--blue)"
                      : "var(--border-bright)"
                  }
                  opacity={0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "8px",
            color: "var(--muted)",
            textAlign: "center",
            marginTop: "4px",
          }}
        >
          Based on {matched.toLocaleString()} analyzed job descriptions
        </div>
      </div>
    </div>
  );
}
