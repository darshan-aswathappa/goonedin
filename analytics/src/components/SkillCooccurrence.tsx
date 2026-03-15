"use client";

import { tierColor } from "@/lib/tokens";

interface Pair {
  a: string;
  b: string;
  count: number;
}

interface Props {
  data: Pair[];
}

export default function SkillCooccurrence({ data }: Props) {
  const top = data.slice(0, 18);
  const maxCount = top[0]?.count ?? 1;

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Commonly Paired Skills</div>
      <div className="panel-body rank-list">
        {top.length === 0 && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--muted)",
              marginTop: "12px",
            }}
          >
            No skill pairs found yet
          </span>
        )}
        {top.map((pair, i) => {
          const pct = (pair.count / maxCount) * 100;
          const color = tierColor(i);
          return (
            <div key={`${pair.a}-${pair.b}`} className="rank-row">
              <span className="rank-number">{i + 1}</span>
              <div style={{ flex: 1, position: "relative", height: "16px" }}>
                <div
                  className="rank-bar"
                  style={{ width: `${pct}%`, background: color, opacity: 0.18 }}
                />
                <span
                  className="rank-label"
                  style={{
                    fontSize: "9px",
                    fontWeight: i < 5 ? 600 : 400,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "90%",
                  }}
                >
                  <span style={{ color }}>{pair.a}</span>
                  <span style={{ color: "var(--muted)", margin: "0 4px" }}>&#x2194;</span>
                  <span style={{ color }}>{pair.b}</span>
                </span>
              </div>
              <span className="rank-count" style={{ color, minWidth: "28px" }}>
                {pair.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
