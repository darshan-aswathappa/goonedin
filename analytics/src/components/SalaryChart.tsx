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
  buckets: { label: string; count: number }[];
  listedRate: number;
  listedCount: number;
  medianEstimate: number | null;
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
      <div style={{ color: "var(--teal)" }}>{payload[0]?.payload?.label}</div>
      <div style={{ color: "var(--text)", fontWeight: 700, marginTop: "2px" }}>
        {payload[0]?.value?.toLocaleString()} jobs
      </div>
    </div>
  );
}

export default function SalaryChart({
  buckets,
  listedRate,
  listedCount,
  medianEstimate,
}: Props) {
  const max = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">
        Salary Distribution
        <span
          style={{
            marginLeft: "auto",
            color: "var(--teal)",
            fontSize: "9px",
            fontWeight: 700,
          }}
        >
          {listedRate}% LIST SALARY
        </span>
      </div>
      <div
        style={{
          padding: "10px 12px 0",
          height: "calc(100% - 37px)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {/* Median callout */}
        {medianEstimate && (
          <div
            style={{
              display: "flex",
              gap: "16px",
              marginBottom: "4px",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "var(--green)",
                  lineHeight: 1,
                }}
              >
                ${Math.round(medianEstimate / 1000)}K
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "7px",
                  color: "var(--muted)",
                  letterSpacing: "0.12em",
                  marginTop: "2px",
                }}
              >
                MEDIAN EST.
              </div>
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "var(--text-dim)",
                  lineHeight: 1,
                }}
              >
                {listedCount.toLocaleString()}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "7px",
                  color: "var(--muted)",
                  letterSpacing: "0.12em",
                  marginTop: "2px",
                }}
              >
                LISTED
              </div>
            </div>
          </div>
        )}

        {/* Bar chart */}
        <div style={{ flex: 1 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={buckets}
              layout="vertical"
              margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fontSize: 8, fontFamily: "var(--font-mono)", fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
                domain={[0, max]}
              />
              <YAxis
                dataKey="label"
                type="category"
                tick={{ fontSize: 8, fontFamily: "var(--font-mono)", fill: "var(--text-dim)" }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[0, 2, 2, 0]} animationDuration={600}>
                {buckets.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      i === Math.floor(buckets.length / 2)
                        ? "var(--green)"
                        : i < Math.floor(buckets.length / 2)
                        ? "var(--blue)"
                        : "var(--teal)"
                    }
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
