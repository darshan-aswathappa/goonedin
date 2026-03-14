"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
} from "recharts";

interface Props {
  data: { hour: number; count: number }[];
}

const HOUR_LABELS: Record<number, string> = {
  0: "12am", 3: "3am", 6: "6am", 9: "9am",
  12: "12pm", 15: "3pm", 18: "6pm", 21: "9pm",
};

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const h = payload[0]?.payload?.hour;
  const label = h !== undefined ? `${h}:00 — ${h + 1}:00` : "";
  return (
    <div
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border-bright)",
        padding: "6px 10px",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        borderRadius: "var(--radius)",
      }}
    >
      <div style={{ color: "var(--teal)" }}>{label}</div>
      <div style={{ color: "var(--text)", fontWeight: 700 }}>{payload[0]?.value} postings</div>
    </div>
  );
}

export default function PostingHeatmap({ data }: Props) {
  // Build 24-spoke data
  const chartData = data.map((d) => ({
    hour: d.hour,
    label: HOUR_LABELS[d.hour] ?? `${d.hour}h`,
    count: d.count,
  }));

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">24h Posting Activity</div>
      <div style={{ padding: "8px", height: "calc(100% - 37px)" }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <PolarGrid
              stroke="var(--border)"
              radialLines={true}
            />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fontSize: 8, fontFamily: "var(--font-mono)", fill: "var(--muted)" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Radar
              name="Postings"
              dataKey="count"
              stroke="var(--teal)"
              fill="var(--teal)"
              fillOpacity={0.18}
              strokeWidth={1.5}
              animationDuration={600}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
