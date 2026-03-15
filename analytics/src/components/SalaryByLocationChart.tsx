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
} from "recharts";
import ChartTooltip from "./ChartTooltip";
import { AXIS_TICK_SM, BAR_CURSOR, CHART_ANIM_MS } from "@/lib/tokens";

function CityTick({
  x,
  y,
  payload,
}: {
  x: number;
  y: number;
  payload: { value: string };
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        fill="var(--text-dim)"
        fontSize={8}
        fontFamily="var(--font-mono)"
      >
        {payload.value}
      </text>
    </g>
  );
}

interface CityData {
  city: string;
  median: number;
  count: number;
}

interface Props {
  cities: CityData[];
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
            <BarChart data={cities} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                tick={AXIS_TICK_SM}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${Math.round(v / 1000)}K`}
              />
              <YAxis
                dataKey="city"
                type="category"
                tick={<CityTick x={0} y={0} payload={{ value: "" }} />}
                axisLine={false}
                tickLine={false}
                width={130}
                interval={0}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    accentColor="var(--green)"
                    formatLabel={(p) => p?.city ?? ""}
                    formatValue={(_, p) =>
                      `$${p?.median?.toLocaleString()} median · n=${p?.count} jobs`
                    }
                  />
                }
                cursor={BAR_CURSOR}
              />
              <Bar dataKey="median" radius={[0, 2, 2, 0]} animationDuration={CHART_ANIM_MS}>
                {cities.map((_, i) => (
                  <Cell
                    key={i}
                    fill={i < 3 ? "var(--green)" : i < 7 ? "var(--teal)" : "var(--blue)"}
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
