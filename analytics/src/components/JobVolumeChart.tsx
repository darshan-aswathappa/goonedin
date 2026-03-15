"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import ChartTooltip from "./ChartTooltip";
import { AXIS_TICK, CHART_ANIM_MS } from "@/lib/tokens";

interface DataPoint {
  day: string;
  count: number;
}

const RANGES = [
  { label: "7D", days: 7 },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
] as const;

interface Props {
  data: DataPoint[];
}

export default function JobVolumeChart({ data: initialData }: Props) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DataPoint[]>(initialData);
  const [loading, setLoading] = useState(false);

  const isDefault = days === 30;

  const fetchData = useCallback(async () => {
    if (isDefault) {
      setData(initialData);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days) });
      const res = await fetch(`/api/analytics/timeline?${params}`);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const json = await res.json();
      if (Array.isArray(json.timeline)) {
        setData(json.timeline);
      }
    } catch {
      // keep current data on error
    } finally {
      setLoading(false);
    }
  }, [days, isDefault, initialData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="panel chart-enter" style={{ padding: "0", height: "100%" }}>
      <div className="panel-header" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
          Job Volume
          {" \u2014 "}
          {days}D Trend
          <span
            style={{
              color: "var(--text-dim)",
              fontWeight: 400,
              marginLeft: "8px",
              fontSize: "8px",
            }}
          >
            {total.toLocaleString()} total
          </span>
        </span>

        <div style={{ display: "flex", gap: "4px", alignItems: "center", flexShrink: 0, marginLeft: "auto" }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className="filter-btn"
              data-active={days === r.days}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-body-chart" style={{ position: "relative" }}>
        {loading && (
          <div
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              fontFamily: "var(--font-mono)",
              fontSize: "8px",
              color: "var(--teal)",
              letterSpacing: "0.1em",
              zIndex: 10,
            }}
          >
            UPDATING...
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 20, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--teal)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(v) => {
                try {
                  return format(parseISO(v), "MMM d");
                } catch {
                  return v;
                }
              }}
              tick={AXIS_TICK}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={40}
            />
            <Tooltip
              content={
                <ChartTooltip
                  formatLabel={(_, label) =>
                    label ? format(parseISO(label), "MMM d, yyyy") : ""
                  }
                />
              }
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--teal)"
              strokeWidth={2}
              fill="url(#volumeGradient)"
              animationDuration={CHART_ANIM_MS}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
