"use client";

interface Props {
  data: { a: string; b: string; count: number }[];
}

export default function SkillCooccurrence({ data }: Props) {
  const top = data.slice(0, 15);
  const maxCount = top[0]?.count ?? 1;

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Skill Co-occurrence</div>
      <div className="panel-body">
        {top.map((row, i) => {
          const pct = (row.count / maxCount) * 100;
          const isTop3 = i < 3;
          return (
            <div key={`${row.a}-${row.b}`} className="rank-row" style={{ marginBottom: "6px" }}>
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
              <div style={{ width: "35%", flexShrink: 0, height: "6px", position: "relative" }}>
                <div
                  style={{
                    height: "6px",
                    width: `${pct}%`,
                    background: isTop3 ? "var(--teal)" : "var(--border-bright)",
                    borderRadius: "1px",
                    minWidth: "2px",
                  }}
                />
              </div>
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
                {row.a} + {row.b}
              </span>
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
