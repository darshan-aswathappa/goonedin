"use client";

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  SkillGapItem,
  Quadrant,
  computeQuadrant,
  computeMedianTotal,
  formatGrowth,
} from "@/lib/skill-gap-helpers";

interface Props {
  skills: SkillGapItem[];
  dateRange: { start: string; end: string } | null;
}

interface ScatterPoint {
  x: number;
  y: number; // clamped growth for display
  growthRaw: number; // actual growth for tooltip
  skill: string;
  quadrant: Quadrant;
  total: number;
}

const QUADRANT_COLORS: Record<Quadrant, string> = {
  BREAKOUT: "var(--teal)",
  DOMINANT: "var(--green)",
  FADING: "var(--red)",
  NICHE: "var(--muted)",
};

const QUADRANT_RADII: Record<Quadrant, number> = {
  BREAKOUT: 5,
  DOMINANT: 4,
  FADING: 4,
  NICHE: 3,
};

// Cap Y display range to keep chart readable regardless of outliers
const Y_DISPLAY_MIN = -100;
const Y_DISPLAY_MAX = 300;

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };

interface TooltipPayload {
  payload?: ScatterPoint;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || !payload[0]?.payload) return null;
  const d = payload[0].payload;
  const growthColor =
    d.growthRaw > 0
      ? "var(--green)"
      : d.growthRaw < 0
        ? "var(--red)"
        : "var(--muted)";

  return (
    <div
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        padding: "8px 10px",
        borderRadius: "2px",
        minWidth: "120px",
      }}
    >
      <div
        style={{
          ...MONO,
          fontSize: "10px",
          color: "var(--text)",
          fontWeight: 700,
          marginBottom: "5px",
        }}
      >
        {d.skill}
      </div>
      <div
        style={{
          ...MONO,
          fontSize: "8px",
          color: "var(--text-dim)",
          lineHeight: 1.8,
        }}
      >
        <div>
          TOTAL:{" "}
          <span style={{ color: "var(--text)" }}>
            {d.total.toLocaleString()}
          </span>
        </div>
        <div>
          14D GROWTH:{" "}
          <span style={{ color: growthColor }}>
            {formatGrowth(d.growthRaw)}
          </span>
        </div>
        <div>
          QUAD:{" "}
          <span style={{ color: QUADRANT_COLORS[d.quadrant] }}>
            {d.quadrant}
          </span>
        </div>
      </div>
    </div>
  );
}

const TICK_STYLE = {
  fontFamily: "var(--font-mono)",
  fontSize: "7px",
  fill: "var(--muted)",
};

function fmtY(v: number): string {
  const prefix = v > 0 ? "+" : "";
  if (Math.abs(v) >= 300) return `${prefix}${Math.round(v / 100) * 100}%`;
  return `${prefix}${Math.round(v)}%`;
}

function fmtX(v: number): string {
  const n = Math.round(v);
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function SkillVelocityScatter({ skills, dateRange }: Props) {
  // Use top 60 by total — enough for a dense scatter without too much noise
  const top60 = useMemo(() => skills.slice(0, 60), [skills]);

  const medianTotal = useMemo(() => computeMedianTotal(top60), [top60]);

  // Clamp growth to display range; keep raw for tooltip
  const points = useMemo(
    (): ScatterPoint[] =>
      top60.map((s) => {
        const clamped = Math.min(
          Math.max(s.growth, Y_DISPLAY_MIN),
          Y_DISPLAY_MAX,
        );
        return {
          x: s.total,
          y: clamped,
          growthRaw: s.growth,
          skill: s.skill,
          quadrant: computeQuadrant(s.total, s.growth, medianTotal),
          total: s.total,
        };
      }),
    [top60, medianTotal],
  );

  const byQuadrant = useMemo(() => {
    const acc: Record<Quadrant, ScatterPoint[]> = {
      BREAKOUT: [],
      DOMINANT: [],
      FADING: [],
      NICHE: [],
    };
    for (const p of points) {
      acc[p.quadrant] = [...acc[p.quadrant], p];
    }
    return acc;
  }, [points]);

  // X-axis: round to integer to avoid floating-point ticks
  const xMax = useMemo(
    () => Math.round(Math.max(...top60.map((s) => s.total), 1) * 1.08),
    [top60],
  );

  const rangeLabel = useMemo(() => {
    if (!dateRange) return null;
    const fmt = (s: string) => s.slice(5).replace("-", "/");
    return `VELOCITY WINDOW: ${fmt(dateRange.start)} \u2014 ${fmt(dateRange.end)}`;
  }, [dateRange]);

  if (top60.length < 3) {
    return (
      <div className="panel chart-enter">
        <div
          className="panel-header"
          style={{ display: "flex", alignItems: "center" }}
        >
          <span>SKILL VELOCITY MATRIX</span>
          <span
            style={{
              ...MONO,
              fontSize: "7px",
              color: "var(--muted)",
              fontWeight: 400,
              letterSpacing: "0.1em",
              marginLeft: "auto",
            }}
          >
            14D GROWTH vs TOTAL DEMAND
          </span>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...MONO,
            fontSize: "9px",
            color: "var(--muted)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          INSUFFICIENT DATA
        </div>
      </div>
    );
  }

  return (
    <div
      className="panel chart-enter"
      style={{ display: "flex", flexDirection: "column" }}
    >
      {/* Header */}
      <div
        className="panel-header"
        style={{ display: "flex", alignItems: "center" }}
      >
        <span>SKILL VELOCITY MATRIX</span>
        <span
          style={{
            ...MONO,
            fontSize: "7px",
            color: "var(--muted)",
            fontWeight: 400,
            letterSpacing: "0.1em",
            marginLeft: "auto",
          }}
        >
          14D GROWTH vs TOTAL DEMAND
        </span>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 16, bottom: 8, left: 4 }}>
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, xMax]}
              tick={TICK_STYLE}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={fmtX}
              tickCount={5}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[Y_DISPLAY_MIN, Y_DISPLAY_MAX]}
              tick={TICK_STYLE}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={fmtY}
              width={52}
              tickCount={5}
            />

            {/* Quadrant dividers */}
            <ReferenceLine
              x={medianTotal}
              stroke="var(--border)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <ReferenceLine
              y={0}
              stroke="var(--border)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "var(--border-bright)", strokeWidth: 1 }}
            />

            {(["BREAKOUT", "DOMINANT", "FADING", "NICHE"] as Quadrant[]).map(
              (q) => (
                <Scatter
                  key={q}
                  name={q}
                  data={byQuadrant[q]}
                  fill={QUADRANT_COLORS[q]}
                  r={QUADRANT_RADII[q]}
                  opacity={0.85}
                />
              ),
            )}
          </ScatterChart>
        </ResponsiveContainer>

        {/* Quadrant corner labels */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 22,
            left: 60,
            ...MONO,
            fontSize: "7px",
            color: "var(--muted)",
            letterSpacing: "0.08em",
            display: "flex",
            alignItems: "center",
            gap: "3px",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--teal)",
              flexShrink: 0,
            }}
          />
          BREAKOUT
        </div>
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 22,
            right: 20,
            ...MONO,
            fontSize: "7px",
            color: "var(--muted)",
            letterSpacing: "0.08em",
            pointerEvents: "none",
          }}
        >
          DOMINANT
        </div>
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: 28,
            right: 20,
            ...MONO,
            fontSize: "7px",
            color: "var(--muted)",
            letterSpacing: "0.08em",
            pointerEvents: "none",
          }}
        >
          FADING
        </div>
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: 28,
            left: 60,
            ...MONO,
            fontSize: "7px",
            color: "var(--muted)",
            letterSpacing: "0.08em",
            pointerEvents: "none",
          }}
        >
          NICHE
        </div>
      </div>

      {/* Footer: date range + outlier note */}
      <div
        style={{
          padding: "4px 14px 6px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span
          style={{
            ...MONO,
            fontSize: "7px",
            color: "var(--muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {rangeLabel ?? ""}
        </span>
        <span
          style={{
            ...MONO,
            fontSize: "7px",
            color: "var(--muted)",
            opacity: 0.6,
            whiteSpace: "nowrap",
          }}
        >
          Y CAPPED ±300% · HOVER FOR ACTUAL
        </span>
      </div>
    </div>
  );
}
