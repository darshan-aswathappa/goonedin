"use client";

interface Props {
  data: { keyword: string; count: number }[];
}

const COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899"];

export default function GoodToHavePanel({ data }: Props) {
  const top = data.slice(0, 20);
  const maxCount = top[0]?.count ?? 1;

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Good-to-Have Keywords</div>
      <div
        style={{
          padding: "10px 14px",
          height: "calc(100% - 37px)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "5px",
        }}
      >
        {top.map((row, i) => {
          const pct = (row.count / maxCount) * 100;
          const color = COLORS[Math.floor(i / 4)] ?? COLORS[COLORS.length - 1];
          return (
            <div key={row.keyword} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--muted)",
                  width: "14px",
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <div style={{ flex: 1, position: "relative", height: "14px" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${pct}%`,
                    background: color,
                    opacity: 0.2,
                    borderRadius: "1px",
                    transition: "width 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                    minWidth: "2px",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    left: "6px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    color: "var(--text)",
                    fontWeight: i < 5 ? 600 : 400,
                    letterSpacing: "0.02em",
                  }}
                >
                  {row.keyword}
                </span>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color,
                  fontWeight: 600,
                  flexShrink: 0,
                  minWidth: "24px",
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
