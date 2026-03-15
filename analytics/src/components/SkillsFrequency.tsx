"use client";

import { tierColor } from "@/lib/tokens";

interface Props {
  data: { keyword: string; count: number }[];
}

export default function SkillsFrequency({ data }: Props) {
  const top = data.slice(0, 20);
  const maxCount = top[0]?.count ?? 1;

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Technical Skills</div>
      <div className="panel-body rank-list">
        {top.map((row, i) => {
          const pct = (row.count / maxCount) * 100;
          const color = tierColor(i);
          return (
            <div key={row.keyword} className="rank-row">
              <span className="rank-number">{i + 1}</span>
              <div style={{ flex: 1, position: "relative", height: "14px" }}>
                <div className="rank-bar" style={{ width: `${pct}%`, background: color }} />
                <span
                  className="rank-label"
                  style={{ fontWeight: i < 5 ? 600 : 400 }}
                >
                  {row.keyword}
                </span>
              </div>
              <span className="rank-count" style={{ color }}>{row.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
