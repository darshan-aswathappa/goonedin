"use client";

import { useEffect, useRef } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface Props {
  label: string;
  value: string | number;
  subLabel?: string;
  accent?: "teal" | "amber" | "green" | "red" | "blue";
  sparklineData?: { v: number }[];
  delta?: string;
  deltaPositive?: boolean;
  delay?: number;
  rank?: number;
  updatedAt?: string;
}

const ACCENT_COLORS = {
  teal: "var(--teal)",
  amber: "var(--amber)",
  green: "var(--green)",
  red: "var(--red)",
  blue: "var(--blue)",
};

export default function MetricCard({
  label,
  value,
  subLabel,
  accent = "teal",
  sparklineData,
  delta,
  deltaPositive,
  delay = 0,
  rank,
  updatedAt,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    const t = setTimeout(() => {
      el.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    }, delay);
    return () => clearTimeout(t);
  }, [delay]);

  const color = ACCENT_COLORS[accent];

  return (
    <div
      ref={cardRef}
      className="panel"
      style={{
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        minHeight: "100px",
      }}
    >
      {/* Top row: rank badge + label */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {rank !== undefined && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "7px",
                color: "var(--muted)",
                background: "#111",
                border: "1px solid var(--border)",
                padding: "1px 4px",
                letterSpacing: "0.1em",
                flexShrink: 0,
              }}
            >
              {String(rank).padStart(2, "0")}
            </span>
          )}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "8px",
              fontWeight: 600,
              letterSpacing: "0.2em",
              color: "var(--muted)",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
        </div>
      </div>

      {/* Value + sparkline row */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "28px",
              fontWeight: 700,
              color: color,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>

          {/* Separator rule between value and sub-label */}
          <div
            style={{
              height: "1px",
              background: "var(--border)",
              margin: "5px 0 4px",
            }}
          />

          {(subLabel || delta) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {subLabel && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    color: "var(--muted)",
                    letterSpacing: "0.05em",
                  }}
                >
                  {subLabel}
                </span>
              )}
              {delta && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    color: deltaPositive ? "var(--green)" : "var(--red)",
                    letterSpacing: "0.05em",
                  }}
                >
                  {deltaPositive ? "▲" : "▼"} {delta}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Mini sparkline */}
        {sparklineData && sparklineData.length > 1 && (
          <div style={{ width: 80, height: 36, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={1.5}
                  dot={false}
                  strokeOpacity={0.8}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Updated at timestamp */}
      {updatedAt && (
        <div
          style={{
            position: "absolute",
            bottom: "6px",
            right: "8px",
            fontFamily: "var(--font-mono)",
            fontSize: "7px",
            color: "var(--muted)",
            letterSpacing: "0.08em",
          }}
        >
          UPD {updatedAt}
        </div>
      )}

      {/* Bottom accent bar — striped terminal data-bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: `repeating-linear-gradient(90deg, ${color} 0px, ${color} 3px, transparent 3px, transparent 6px)`,
          opacity: 0.6,
          color: color,
        }}
      />
    </div>
  );
}
