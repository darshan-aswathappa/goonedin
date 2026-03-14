"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";

interface Props {
  data: { function: string; count: number; color: string }[];
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
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
      <div style={{ color: payload[0]?.payload?.color }}>{payload[0]?.payload?.function}</div>
      <div style={{ color: "var(--text)", fontWeight: 700 }}>{payload[0]?.value} jobs</div>
    </div>
  );
}

export default function JobFunctionsChart({ data }: Props) {
  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Job Function Breakdown</div>
      <div style={{ padding: "8px 4px", height: "calc(100% - 37px)" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 48, bottom: 0, left: 8 }}
          >
            <XAxis
              type="number"
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              type="category"
              dataKey="function"
              width={78}
              tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--text-dim)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--bg-surface)", opacity: 0.5 }} />
            <Bar dataKey="count" radius={[0, 2, 2, 0]} maxBarSize={16}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
