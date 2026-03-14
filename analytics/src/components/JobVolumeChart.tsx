"use client";

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

interface Props {
  data: { day: string; count: number }[];
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
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

export default function JobVolumeChart({ data }: Props) {
  return (
    <div className="panel chart-enter" style={{ padding: "0", height: "100%" }}>
      <div className="panel-header">Job Volume — 30 Day Trend</div>
      <div style={{ padding: "12px 12px 0", height: "calc(100% - 37px)" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
                try { return format(parseISO(v), "MMM d"); } catch { return v; }
              }}
              tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "var(--muted)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
              width={35}
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
