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

interface FunctionData {
  function: string;
  median: number;
  count: number;
  color: string;
}

interface Props {
  data: FunctionData[];
}

function FunctionTick({
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

export default function SalaryByJobFunctionChart({ data }: Props) {
  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">
        Salary by Function
        <span
          style={{
            marginLeft: "auto",
            color: "var(--teal)",
            fontSize: "9px",
            fontWeight: 700,
          }}
        >
          {data.length} FUNCTIONS
        </span>
      </div>
      <div
        data-testid="salary-by-fn-body"
        style={{ height: "calc(100% - 37px)" }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 32, left: 0, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={AXIS_TICK_SM}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${Math.round(v / 1000)}K`}
            />
            <YAxis
              dataKey="function"
              type="category"
              tick={<FunctionTick x={0} y={0} payload={{ value: "" }} />}
              axisLine={false}
              tickLine={false}
              width={80}
              interval={0}
            />
            <Tooltip
              content={
                <ChartTooltip
                  formatLabel={(p) => p?.function ?? ""}
                  formatValue={(_, p) =>
                    `$${p?.median?.toLocaleString()} median · n=${p?.count} jobs`
                  }
                />
              }
              cursor={BAR_CURSOR}
            />
            <Bar dataKey="median" radius={[0, 2, 2, 0]} animationDuration={CHART_ANIM_MS}>
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
