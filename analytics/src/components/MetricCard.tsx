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
      {/* Label */}
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
          {(subLabel || delta) && (
            <div
              style={{
                marginTop: "5px",
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

      {/* Bottom accent bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: color,
          opacity: 0.5,
        }}
      />
    </div>
  );
}
