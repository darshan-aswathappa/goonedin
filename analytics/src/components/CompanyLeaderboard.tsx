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
  data: { company: string; count: number }[];
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
      <div style={{ color: "var(--teal)" }}>{payload[0]?.payload?.company}</div>
      <div style={{ color: "var(--text)", fontWeight: 700, marginTop: "2px" }}>
        {payload[0]?.value?.toLocaleString()} postings
      </div>
    </div>
  );
}

export default function CompanyLeaderboard({ data }: Props) {
  const top = data.slice(0, 15);
  const maxCount = top[0]?.count ?? 1;

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Company Rankings</div>
      <div style={{ padding: "12px 4px 12px 12px", height: "calc(100% - 37px)", overflowY: "auto" }}>
        {top.map((row, i) => {
          const pct = (row.count / maxCount) * 100;
          const isTop3 = i < 3;
          return (
            <div
              key={row.company}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "7px",
                padding: "5px 6px",
                borderRadius: "var(--radius)",
                background: isTop3 ? "rgba(0,212,170,0.04)" : "transparent",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,212,170,0.07)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = isTop3 ? "rgba(0,212,170,0.04)" : "transparent")}
            >
              {/* Rank */}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: isTop3 ? "var(--teal)" : "var(--muted)",
                  width: "16px",
                  textAlign: "right",
                  flexShrink: 0,
                  fontWeight: isTop3 ? 700 : 400,
                }}
              >
                {i + 1}
              </span>

              {/* Bar */}
              <div style={{ width: "45%", flexShrink: 0, height: "6px", position: "relative" }}>
                <div
                  style={{
                    height: "6px",
                    width: `${pct}%`,
                    background: isTop3 ? "var(--teal)" : "var(--border-bright)",
                    borderRadius: "1px",
                    transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                    minWidth: "2px",
                  }}
                />
              </div>
              {/* Label */}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {row.company}
              </span>

              {/* Count */}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: isTop3 ? "var(--text)" : "var(--muted)",
                  fontWeight: isTop3 ? 700 : 400,
                  flexShrink: 0,
                  minWidth: "28px",
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
