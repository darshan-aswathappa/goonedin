"use client";

import { useMemo } from "react";
import { MOMENTUM } from "@/lib/tokens";

interface DailyCount {
  day: string;
  count: number;
}

interface SkillData {
  skill: string;
  total: number;
  daily: DailyCount[];
}

interface Props {
  skills: SkillData[];
  dailyJobs: DailyCount[];
  dateRange: { start: string; end: string } | null;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 80;
  const h = 20;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - (v / max) * (h - 2) - 1}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={80} height={20} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ComputedRow {
  skill: string;
  total: number;
  daily: number[];
  early: number;
  late: number;
  momentum: number | null;
}

function computeRows(
  skills: SkillData[],
  dailyJobs: DailyCount[],
  filteredDays: string[]
): ComputedRow[] {
  if (filteredDays.length < 2) return [];

  const mid = Math.floor(filteredDays.length / 2);
  const earlyDays = new Set(filteredDays.slice(0, mid));
  const lateDays = new Set(filteredDays.slice(mid));
  const filteredSet = new Set(filteredDays);
  const jobsMap = new Map(dailyJobs.map((d) => [d.day, d.count]));

  let earlyJobsTotal = 0;
  let lateJobsTotal = 0;
  for (const day of earlyDays) earlyJobsTotal += jobsMap.get(day) ?? 0;
  for (const day of lateDays) lateJobsTotal += jobsMap.get(day) ?? 0;

  if (earlyJobsTotal === 0 || lateJobsTotal === 0) return [];

  return skills
    .map((s) => {
      const filteredDaily = s.daily.filter((d) => filteredSet.has(d.day));
      const filteredTotal = filteredDaily.reduce((acc, d) => acc + d.count, 0);
      if (filteredTotal === 0) return null;

      let early = 0;
      let late = 0;
      for (const d of filteredDaily) {
        if (earlyDays.has(d.day)) early += d.count;
        else if (lateDays.has(d.day)) late += d.count;
      }

      const earlyRate = early / earlyJobsTotal;
      const lateRate = late / lateJobsTotal;
      const momentum =
        earlyRate === 0
          ? lateRate > 0 ? 100 : 0
          : Math.round(((lateRate - earlyRate) / earlyRate) * 1000) / 10;

      return {
        skill: s.skill,
        total: filteredTotal,
        daily: filteredDays.map(
          (day) => filteredDaily.find((d) => d.day === day)?.count ?? 0
        ),
        early,
        late,
        momentum,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => (b.momentum ?? -Infinity) - (a.momentum ?? -Infinity))
    .slice(0, 20);
}

const COL_GRID = "minmax(0,1fr) 80px 44px 44px 44px 64px";

function ColumnHeaders() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COL_GRID,
        gap: "2px",
        padding: "6px 0 4px",
        borderBottom: "1px solid var(--border)",
        fontFamily: "var(--font-mono)",
        fontSize: "7px",
        color: "var(--muted)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      <span>Skill</span>
      <span>Trend</span>
      <span style={{ textAlign: "right" }}>Total</span>
      <span style={{ textAlign: "right" }}>Early</span>
      <span style={{ textAlign: "right" }}>Late</span>
      <span style={{ textAlign: "right" }}>Mom.</span>
    </div>
  );
}

function SkillRow({ row, rank }: { row: ComputedRow; rank: number }) {
  const mColor =
    row.momentum === null
      ? MOMENTUM.none
      : row.momentum > 0
      ? MOMENTUM.up
      : row.momentum < 0
      ? MOMENTUM.down
      : MOMENTUM.flat;
  const sparkColor =
    row.momentum !== null && row.momentum > 0
      ? "var(--teal)"
      : row.momentum !== null && row.momentum < 0
      ? "var(--red)"
      : "var(--border-bright)";
  const arrow =
    row.momentum !== null && row.momentum > 0
      ? "\u25B2"
      : row.momentum !== null && row.momentum < 0
      ? "\u25BC"
      : "";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COL_GRID,
        gap: "2px",
        padding: "4px 0",
        borderBottom: "1px solid var(--border)",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "var(--text)",
          fontWeight: rank <= 3 ? 600 : 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {row.skill}
      </span>
      <Sparkline data={row.daily} color={sparkColor} />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "var(--text-dim)",
          textAlign: "right",
          fontWeight: 700,
        }}
      >
        {row.total}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "var(--muted)",
          textAlign: "right",
        }}
      >
        {row.early}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "var(--muted)",
          textAlign: "right",
        }}
      >
        {row.late}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: mColor,
          textAlign: "right",
          fontWeight: 600,
        }}
      >
        {row.momentum !== null
          ? `${arrow}\u00A0${row.momentum > 0 ? "+" : ""}${row.momentum.toFixed(1)}%`
          : "\u2014"}
      </span>
    </div>
  );
}

export default function SkillMomentumTable({ skills, dailyJobs }: Props) {
  const allDays = useMemo(() => dailyJobs.map((d) => d.day).sort(), [dailyJobs]);

  const filteredDays = useMemo(() => {
    if (allDays.length === 0) return allDays;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const filtered = allDays.filter((d) => d >= cutoffStr);
    return filtered.length >= 2 ? filtered : allDays;
  }, [allDays]);

  const rangeLabel = useMemo(() => {
    if (filteredDays.length < 2) return "";
    const s = filteredDays[0].slice(5);
    const e = filteredDays[filteredDays.length - 1].slice(5);
    return `${filteredDays.length}-day trend ${s} \u2013 ${e}`;
  }, [filteredDays]);

  const computed = useMemo(
    () => computeRows(skills, dailyJobs, filteredDays),
    [skills, dailyJobs, filteredDays]
  );

  // Momentum compares an early window against a late one, so a single day of
  // history cannot yield a value at all. Report that separately from "no skills
  // found" — collapsing both into one message makes a young dataset look
  // identical to a failed query.
  const emptyReason =
    skills.length > 0 && filteredDays.length < 2
      ? `Awaiting history — momentum needs 2+ days, have ${filteredDays.length}`
      : "No skill data available";

  const leftCol = computed.slice(0, 10);
  const rightCol = computed.slice(10, 20);

  return (
    <div className="panel chart-enter skill-momentum-panel">
      <div className="panel-header" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span>Top 20 Skills by Momentum</span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "8px",
            color: "var(--muted)",
            fontWeight: 400,
            letterSpacing: "0.04em",
            marginLeft: "auto",
          }}
        >
          {rangeLabel}
        </span>
      </div>

      <div
        className="skill-momentum-cols"
        style={{ padding: "0 14px 10px", display: "flex", gap: "16px" }}
      >
        {computed.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--muted)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {emptyReason}
          </div>
        ) : (
          <>
            <div className="skill-momentum-col" style={{ flex: 1, minWidth: 0 }}>
              <ColumnHeaders />
              {leftCol.map((row, i) => (
                <SkillRow key={row.skill} row={row} rank={i + 1} />
              ))}
            </div>
            <div
              className="skill-momentum-divider"
              style={{ width: "1px", background: "var(--border)", flexShrink: 0 }}
            />
            <div className="skill-momentum-col" style={{ flex: 1, minWidth: 0 }}>
              <ColumnHeaders />
              {rightCol.map((row, i) => (
                <SkillRow key={row.skill} row={row} rank={i + 11} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
