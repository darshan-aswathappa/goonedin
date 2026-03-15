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
  data: { day: string; count: number }[];
  peakDay: string | null;
}

export default function WeekdayChart({ data, peakDay }: Props) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">
        Busiest Posting Days
        {peakDay && (
          <span
            style={{
              marginLeft: "auto",
              color: "var(--amber)",
              fontSize: "9px",
              fontWeight: 700,
            }}
          >
            PEAK: {peakDay.toUpperCase()}
          </span>
        )}
      </div>
      <div className="panel-body-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={AXIS_TICK}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              content={<ChartTooltip accentColor="var(--amber)" />}
              cursor={BAR_CURSOR}
            />
            <Bar dataKey="count" radius={[2, 2, 0, 0]} animationDuration={CHART_ANIM_MS}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.day === peakDay || entry.count === max
                      ? "var(--amber)"
                      : entry.count > max * 0.7
                      ? "var(--teal)"
                      : "var(--border-bright)"
                  }
                  opacity={0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
