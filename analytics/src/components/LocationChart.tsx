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
  data: { city: string; count: number }[];
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
      <div style={{ color: "var(--blue)" }}>{payload[0]?.payload?.city}</div>
      <div style={{ color: "var(--text)", fontWeight: 700 }}>{payload[0]?.value} jobs</div>
    </div>
  );
}

export default function LocationChart({ data }: Props) {
  const top = data.slice(0, 12);
  const maxCount = top[0]?.count ?? 1;

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Top Locations</div>
      <div style={{ padding: "10px 14px", height: "calc(100% - 37px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: "5px" }}>
        {top.map((row, i) => {
          const pct = (row.count / maxCount) * 100;
          return (
            <div key={row.city} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--muted)",
                  width: "14px",
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <div style={{ display: "flex", flex: 1, alignItems: "center", gap: "8px", minWidth: 0 }}>
                <div style={{ width: "50%", flexShrink: 0, height: "5px" }}>
                  <div
                    style={{
                      height: "5px",
                      width: `${pct}%`,
                      background: "var(--blue)",
                      opacity: i === 0 ? 0.9 : 0.5,
                      borderRadius: "1px",
                      transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                      transitionDelay: `${i * 30}ms`,
                      minWidth: "2px",
                    }}
                  />
                </div>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    color: "var(--text-dim)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.city}
                </span>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: i === 0 ? "var(--blue)" : "var(--muted)",
                  fontWeight: i === 0 ? 700 : 400,
                  flexShrink: 0,
                  minWidth: "24px",
                  textAlign: "right",
                }}
              >
                {row.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
