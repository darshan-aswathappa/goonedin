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

interface CityData {
  city: string;
  median: number;
  count: number;
}

interface Props {
  cities: CityData[];
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as CityData;
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
      <div style={{ color: "var(--green)" }}>{data.city}</div>
      <div style={{ color: "var(--text)", fontWeight: 700, marginTop: "2px" }}>
        ${data.median.toLocaleString()} median
      </div>
      <div style={{ color: "var(--muted)", marginTop: "2px" }}>
        n={data.count} jobs
      </div>
    </div>
  );
}

export default function SalaryByLocationChart({ cities }: Props) {
  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">
        Salary &times; Location
        <span
          style={{
            marginLeft: "auto",
            color: "var(--teal)",
            fontSize: "9px",
            fontWeight: 700,
          }}
        >
          {cities.length} CITIES
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
        <div style={{ flex: 1 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={cities}
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
                tick={{
                  fontSize: 8,
                  fontFamily: "var(--font-mono)",
                  fill: "var(--muted)",
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${Math.round(v / 1000)}K`}
              />
              <YAxis
                dataKey="city"
                type="category"
                tick={{
                  fontSize: 8,
                  fontFamily: "var(--font-mono)",
                  fill: "var(--text-dim)",
                }}
                axisLine={false}
                tickLine={false}
                width={100}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
              />
              <Bar dataKey="median" radius={[0, 2, 2, 0]} animationDuration={600}>
                {cities.map((_, i) => (
                  <Cell
                    key={i}
                    fill={
                      i < 3
                        ? "var(--green)"
                        : i < 7
                        ? "var(--teal)"
                        : "var(--blue)"
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
