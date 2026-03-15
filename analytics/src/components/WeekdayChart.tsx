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
  type TooltipProps,
} from "recharts";

interface Props {
  data: { day: string; count: number }[];
  peakDay: string | null;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
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
      <div style={{ color: "var(--amber)" }}>{label}</div>
      <div style={{ color: "var(--text)", fontWeight: 700, marginTop: "2px" }}>
        {payload[0]?.value?.toLocaleString()} jobs
      </div>
    </div>
  );
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
      <div style={{ padding: "12px 12px 0", height: "calc(100% - 37px)" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "var(--muted)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]} animationDuration={600}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.day === peakDay
                      ? "var(--amber)"
                      : entry.count === max
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
