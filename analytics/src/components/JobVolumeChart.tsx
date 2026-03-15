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
  type TooltipProps,
} from "recharts";
import { format, parseISO } from "date-fns";

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

const SOURCES = [{ label: "ALL", value: "" }] as const;

function CustomTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border-bright)",
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        borderRadius: "var(--radius)",
      }}
    >
      <div style={{ color: "var(--teal)", letterSpacing: "0.05em" }}>
        {label ? format(parseISO(label), "MMM d, yyyy") : ""}
      </div>
      <div style={{ color: "var(--text)", marginTop: "3px", fontWeight: 700 }}>
        {payload[0]?.value?.toLocaleString()} jobs
      </div>
    </div>
  );
}

interface Props {
  data: DataPoint[];
}

export default function JobVolumeChart({ data: initialData }: Props) {
  const [days, setDays] = useState(30);
  const [source, setSource] = useState("");
  const [data, setData] = useState<DataPoint[]>(initialData);
  const [loading, setLoading] = useState(false);

  const isDefault = days === 30 && source === "";

  const fetchData = useCallback(async () => {
    if (isDefault) {
      setData(initialData);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (source) params.set("source", source);
      const res = await fetch(`/api/analytics/timeline?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setData(json.timeline ?? []);
    } catch {
      // keep current data on error
    } finally {
      setLoading(false);
    }
  }, [days, source, isDefault, initialData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="panel chart-enter" style={{ padding: "0", height: "100%" }}>
      <div className="panel-header" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
          Job Volume
          {source ? ` · ${source.toUpperCase()}` : ""}
          {" — "}
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
          {/* Source filter */}
          {SOURCES.map((s) => (
            <button
              key={s.value}
              onClick={() => setSource(s.value)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                letterSpacing: "0.1em",
                padding: "2px 6px",
                background:
                  source === s.value ? "var(--teal-dim)" : "transparent",
                color: source === s.value ? "var(--teal)" : "var(--muted)",
                border: `1px solid ${source === s.value ? "var(--teal)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {s.label}
            </button>
          ))}

          <span
            style={{
              width: "1px",
              height: "12px",
              background: "var(--border-bright)",
              margin: "0 4px",
            }}
          />

          {/* Time range filter */}
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                letterSpacing: "0.1em",
                padding: "2px 6px",
                background: days === r.days ? "var(--teal-dim)" : "transparent",
                color: days === r.days ? "var(--teal)" : "var(--muted)",
                border: `1px solid ${days === r.days ? "var(--teal)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "12px 12px 0",
          height: "calc(100% - 37px)",
          position: "relative",
        }}
      >
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
            LOADING...
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 4, right: 20, left: 4, bottom: 0 }}
          >
            <defs>
              <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--teal)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tickFormatter={(v) => {
                try {
                  return format(parseISO(v), "MMM d");
                } catch {
                  return v;
                }
              }}
              tick={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                fill: "var(--muted)",
              }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                fill: "var(--muted)",
              }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--teal)"
              strokeWidth={2}
              fill="url(#volumeGradient)"
              animationDuration={600}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
