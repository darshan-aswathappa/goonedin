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
} from "recharts";
import ChartTooltip from "./ChartTooltip";
import { AXIS_TICK, AXIS_TICK_SM, BAR_CURSOR, CHART_ANIM_MS } from "@/lib/tokens";

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

export default function TimeDistributionChart({ fallbackData }: Props) {
  const [selectedDay, setSelectedDay] = useState<string>("All");
  const [hourlyByDay, setHourlyByDay] = useState<HourlyByDay | null>(null);

  useEffect(() => {
    fetch("/api/analytics/hourly-by-day")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        if (d?.hourlyByDay) setHourlyByDay(d.hourlyByDay);
      })
      .catch(() => {});
  }, []);

  const data = hourlyByDay?.[selectedDay] ?? fallbackData;
  const max = data.length > 0 ? Math.max(...data.map((d) => d.count), 1) : 1;
  const peak = data.length > 0
    ? data.reduce((best, d) => (d.count > best.count ? d : best), data[0])
    : { hour: 0, count: 0 };

  const chartData = data.map((d) => ({
    hour: d.hour,
    label: HOUR_LABELS[d.hour] ?? `${d.hour}h`,
    count: d.count,
  }));

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header" style={{ gap: "8px" }}>
        Posting Times by Day
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "3px" }}>
          {DAYS.map((day) => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className="filter-btn"
              data-active={selectedDay === day}
              style={{
                padding: "1px 5px",
                lineHeight: "14px",
                ...(selectedDay === day
                  ? { background: "var(--teal)", color: "var(--bg-root)", fontWeight: 700 }
                  : {}),
              }}
            >
              {day}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK_SM}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval={2}
            />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              content={
                <ChartTooltip
                  formatLabel={(p) => {
                    const h = p?.hour;
                    return h !== undefined ? `${h}:00 \u2014 ${h + 1}:00` : "";
                  }}
                />
              }
              cursor={BAR_CURSOR}
            />
            <Bar dataKey="count" radius={[2, 2, 0, 0]} animationDuration={CHART_ANIM_MS}>
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
