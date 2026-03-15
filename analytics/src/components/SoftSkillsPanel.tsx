"use client";

interface Props {
  data: { skill: string; count: number }[];
}

export default function SoftSkillsPanel({ data }: Props) {
  const top = data.slice(0, 12);
  const maxCount = top[0]?.count ?? 1;

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Top Qualifications</div>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {top.map((row, i) => {
          const pct = (row.count / maxCount) * 100;
          return (
            <div key={row.skill} className="rank-row">
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    color: "var(--text-dim)",
                    marginBottom: "3px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.skill}
                </div>
                <div
                  style={{
                    height: "3px",
                    background: "var(--border)",
                    borderRadius: "1px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: "var(--amber)",
                      borderRadius: "1px",
                      transition: "width 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                      transitionDelay: `${i * 30}ms`,
                    }}
                  />
                </div>
              </div>
              <span className="rank-count" style={{ color: "var(--amber)" }}>
                {row.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
