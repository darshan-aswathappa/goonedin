"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import ChartTooltip from "./ChartTooltip";
import { AXIS_TICK_SM, CHART_ANIM_MS } from "@/lib/tokens";

interface Props {
  data: { hour: number; count: number }[];
}

const HOUR_LABELS: Record<number, string> = {
  0: "12am", 3: "3am", 6: "6am", 9: "9am",
  12: "12pm", 15: "3pm", 18: "6pm", 21: "9pm",
};

export default function PostingHeatmap({ data }: Props) {
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
            <PolarGrid stroke="var(--border)" radialLines={true} />
            <PolarAngleAxis dataKey="label" tick={AXIS_TICK_SM} />
            <Tooltip
              content={
                <ChartTooltip
                  formatLabel={(p) => {
                    const h = p?.hour;
                    return h !== undefined ? `${h}:00 \u2014 ${h + 1}:00` : "";
                  }}
                  formatValue={(v) => `${v} postings`}
                />
              }
            />
            <Radar
              name="Postings"
              dataKey="count"
              stroke="var(--teal)"
              fill="var(--teal)"
              fillOpacity={0.18}
              strokeWidth={1.5}
              animationDuration={CHART_ANIM_MS}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
