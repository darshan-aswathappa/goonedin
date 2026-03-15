"use client";

interface Props {
  data: { company: string; count: number }[];
}

export default function CompanyLeaderboard({ data }: Props) {
  const top = data.slice(0, 15);
  const maxCount = top[0]?.count ?? 1;

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Company Rankings</div>
      <div className="panel-body">
        {top.map((row, i) => {
          const pct = (row.count / maxCount) * 100;
          const isTop3 = i < 3;
          return (
            <div
              key={row.company}
              className="rank-row"
              style={{
                marginBottom: "7px",
                padding: "5px 6px",
                borderRadius: "var(--radius)",
                background: isTop3 ? "var(--teal-dim)" : "transparent",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--teal-dim)")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = isTop3 ? "var(--teal-dim)" : "transparent")
              }
            >
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
              <div style={{ width: "45%", flexShrink: 0, height: "6px", position: "relative" }}>
                <div
                  style={{
                    height: "6px",
                    width: `${pct}%`,
                    background: isTop3 ? "var(--teal)" : "var(--border-bright)",
                    borderRadius: "1px",
                    transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
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
                {row.company}
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
