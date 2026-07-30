"use client";

import { useMemo } from "react";
import { SkillGapItem, sortSkillsByTotal } from "@/lib/skill-gap-helpers";

interface Props {
  skills: SkillGapItem[];
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
};

export default function SkillDemandBar({ skills }: Props) {
  const top15 = useMemo(() => sortSkillsByTotal(skills).slice(0, 15), [skills]);

  // Domain based on max must_have only — good-to-have bars share same scale
  const maxMustHave = useMemo(
    () => Math.max(...top15.map((s) => s.must_have), 1),
    [top15],
  );

  if (top15.length === 0) {
    return (
      <div className="panel chart-enter">
        <div className="panel-header">
          <span>SKILL DEMAND SPLIT</span>
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
            REQUIRED VS NICE-TO-HAVE
          </span>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            ...MONO,
            fontSize: "9px",
            color: "var(--muted)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          NO SKILL DATA AVAILABLE
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
        <span>SKILL DEMAND SPLIT</span>
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
          REQUIRED VS NICE-TO-HAVE
        </span>
      </div>

      {/* Skill rows */}
      <div
        style={{
          flex: 1,
          padding: "8px 14px 6px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "5px",
        }}
      >
        {top15.map((item) => {
          const mustPct = (item.must_have / maxMustHave) * 100;
          const gthPct = (item.good_to_have / maxMustHave) * 100;

          return (
            <div
              key={item.skill}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 48px",
                alignItems: "center",
                gap: "8px",
                minHeight: "26px",
              }}
            >
              {/* Skill label — fixed column */}
              <span
                style={{
                  ...MONO,
                  fontSize: "9px",
                  color: "var(--text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={item.skill}
              >
                {item.skill}
              </span>

              {/* Bar tracks — flex column, fills remaining space */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: "3px" }}
              >
                {/* Must-have track */}
                <div
                  style={{
                    position: "relative",
                    height: "5px",
                    background: "var(--paper-sunk)",
                    borderRadius: "1px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: `${mustPct}%`,
                      background: "var(--teal)",
                    }}
                  />
                </div>
                {/* Good-to-have track */}
                <div
                  style={{
                    position: "relative",
                    height: "3px",
                    background: "var(--paper-sunk)",
                    borderRadius: "1px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: `${gthPct}%`,
                      background: "var(--ink-faint)",
                    }}
                  />
                </div>
              </div>

              {/* Counts — fixed right column, stacked */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  alignItems: "flex-end",
                }}
              >
                <span
                  style={{
                    ...MONO,
                    fontSize: "8px",
                    color: "var(--teal)",
                    whiteSpace: "nowrap",
                    lineHeight: 1,
                  }}
                >
                  {item.must_have.toLocaleString()}
                </span>
                <span
                  style={{
                    ...MONO,
                    fontSize: "7px",
                    color: "var(--muted)",
                    whiteSpace: "nowrap",
                    lineHeight: 1,
                  }}
                >
                  {item.good_to_have.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          padding: "5px 14px 7px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: "16px",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div
            style={{
              width: "12px",
              height: "5px",
              background: "var(--teal)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              ...MONO,
              fontSize: "7px",
              color: "var(--muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            REQUIRED
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div
            style={{
              width: "12px",
              height: "3px",
              background: "var(--ink-faint)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              ...MONO,
              fontSize: "7px",
              color: "var(--muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            NICE-TO-HAVE
          </span>
        </div>
      </div>
    </div>
  );
}
