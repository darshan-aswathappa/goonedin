"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";
import { format, parseISO } from "date-fns";
import { AXIS_TICK } from "@/lib/tokens";

interface CompanyMeta {
  name: string;
  color: string;
}

interface Props {
  companies: CompanyMeta[];
  data: Record<string, string | number>[];
}

/* ── Custom tooltip ──────────────────────────────────────────────── */
function VelocityTooltip({
  active,
  payload,
  label,
  colorMap,
}: TooltipProps<ValueType, NameType> & { colorMap: Record<string, string> }) {
  if (!active || !payload?.length) return null;

  let dayLabel = label as string;
  try {
    dayLabel = format(parseISO(label as string), "EEE, MMM d");
  } catch {
    // keep raw
  }

  return (
    <div
      style={{
        background: "rgba(8,8,8,0.96)",
        border: "1px solid #1c2a2a",
        borderRadius: "2px",
        padding: "10px 14px",
        fontFamily: "var(--font-mono)",
        minWidth: "160px",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          color: "#aaaaaa",
          marginBottom: "8px",
          letterSpacing: "0.05em",
        }}
      >
        {dayLabel}
      </div>
      {payload.map((entry) => (
        <div
          key={entry.name}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "20px",
            marginBottom: "3px",
          }}
        >
          <span style={{ fontSize: "9px", color: colorMap[String(entry.name ?? "")] ?? "#aaa" }}>
            {String(entry.name ?? "").toLowerCase()}:
          </span>
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              color: colorMap[String(entry.name ?? "")] ?? "#aaa",
            }}
          >
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Main chart ──────────────────────────────────────────────────── */
export default function HiringVelocityChart({ companies, data }: Props) {
  const colorMap = useMemo(
    () => Object.fromEntries(companies.map((c) => [c.name, c.color])),
    [companies],
  );
  if (!companies.length || !data.length) {
    return (
      <div className="panel chart-enter" style={{ height: "100%" }}>
        <div className="panel-header">
          Hiring Velocity — Top 5 Companies
          <span style={{ marginLeft: "auto", color: "var(--blue)", fontSize: "8px", letterSpacing: "0.15em" }}>
            7 DAYS
          </span>
        </div>
        <div
          style={{
            height: "calc(100% - 37px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "var(--muted)",
            letterSpacing: "0.1em",
          }}
        >
          NO DATA
        </div>
      </div>
    );
  }

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      {/* Header */}
      <div className="panel-header" style={{ justifyContent: "space-between" }}>
        <span>Hiring Velocity — Top 5 Companies (7 Days)</span>
        <span
          style={{
            marginLeft: "auto",
            color: "var(--blue)",
            fontSize: "8px",
            letterSpacing: "0.15em",
            flexShrink: 0,
          }}
        >
          ALL SOURCES
        </span>
      </div>

      {/* Chart */}
      <div style={{ padding: "8px 12px 0", height: "calc(100% - 68px)" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 16, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#111a1a" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(v) => {
                try { return format(parseISO(v), "EEE"); } catch { return v; }
              }}
              tick={AXIS_TICK}
              axisLine={{ stroke: "#1c2a2a" }}
              tickLine={false}
            />
            <YAxis
              tick={{ ...AXIS_TICK, fontSize: 8 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={36}
            />
            <Tooltip
              content={(props: TooltipProps<ValueType, NameType>) => (
                <VelocityTooltip {...props} colorMap={colorMap} />
              )}
              cursor={{ stroke: "#334155", strokeWidth: 1, strokeDasharray: "4 2" }}
            />
            {companies.map((c) => (
              <Line
                key={c.name}
                type="monotone"
                dataKey={c.name}
                stroke={c.color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4, fill: c.color, stroke: "#000", strokeWidth: 1.5 }}
                animationDuration={500}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          flexWrap: "wrap",
          padding: "6px 14px 8px",
          borderTop: "1px solid var(--border)",
        }}
      >
        {companies.map((c) => (
          <div key={c.name} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div
              style={{
                width: "14px",
                height: "2px",
                background: c.color,
                borderRadius: "1px",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                color: c.color,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {c.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
