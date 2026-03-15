"use client";

import { useState, useEffect } from "react";
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

const DAYS = ["All", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const HOUR_LABELS: Record<number, string> = {
  0: "12a", 1: "1a", 2: "2a", 3: "3a", 4: "4a", 5: "5a",
  6: "6a", 7: "7a", 8: "8a", 9: "9a", 10: "10a", 11: "11a",
  12: "12p", 13: "1p", 14: "2p", 15: "3p", 16: "4p", 17: "5p",
  18: "6p", 19: "7p", 20: "8p", 21: "9p", 22: "10p", 23: "11p",
};

type HourlyByDay = Record<string, { hour: number; count: number }[]>;

interface Props {
  fallbackData: { hour: number; count: number }[];
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const h = payload[0]?.payload?.hour;
  const label = h !== undefined ? `${h}:00 — ${h + 1}:00` : "";
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
      <div style={{ color: "var(--teal)" }}>{label}</div>
      <div style={{ color: "var(--text)", fontWeight: 700, marginTop: "2px" }}>
        {payload[0]?.value?.toLocaleString()} jobs
      </div>
    </div>
  );
}

export default function TimeDistributionChart({ fallbackData }: Props) {
  const [selectedDay, setSelectedDay] = useState<string>("All");
  const [hourlyByDay, setHourlyByDay] = useState<HourlyByDay | null>(null);

  useEffect(() => {
    fetch("/api/analytics/hourly-by-day")
      .then((r) => r.json())
      .then((d) => {
        if (d.hourlyByDay) setHourlyByDay(d.hourlyByDay);
      })
      .catch(() => {});
  }, []);

  const data = hourlyByDay?.[selectedDay] ?? fallbackData;
  const max = Math.max(...data.map((d) => d.count), 1);
  const peak = data.reduce(
    (best, d) => (d.count > best.count ? d : best),
    data[0] ?? { hour: 0, count: 0 }
  );

  const chartData = data.map((d) => ({
    hour: d.hour,
    label: HOUR_LABELS[d.hour] ?? `${d.hour}h`,
    count: d.count,
  }));

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header" style={{ gap: "8px" }}>
        Time Distribution
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "3px",
          }}
        >
          {DAYS.map((day) => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              style={{
                background:
                  selectedDay === day
                    ? "var(--teal)"
                    : "transparent",
                color:
                  selectedDay === day
                    ? "var(--bg-root)"
                    : "var(--muted)",
                border: "1px solid",
                borderColor:
                  selectedDay === day
                    ? "var(--teal)"
                    : "var(--border)",
                borderRadius: "3px",
                padding: "1px 5px",
                fontSize: "8px",
                fontFamily: "var(--font-mono)",
                fontWeight: selectedDay === day ? 700 : 400,
                cursor: "pointer",
                letterSpacing: "0.03em",
                lineHeight: "14px",
              }}
            >
              {day}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "12px 12px 0", height: "calc(100% - 37px)" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{
                fontSize: 8,
                fontFamily: "var(--font-mono)",
                fill: "var(--muted)",
              }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval={2}
            />
            <YAxis
              tick={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                fill: "var(--muted)",
              }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="count"
              radius={[2, 2, 0, 0]}
              animationDuration={600}
            >
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.hour === peak?.hour
                      ? "var(--teal)"
                      : entry.count > max * 0.7
                      ? "var(--green)"
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
