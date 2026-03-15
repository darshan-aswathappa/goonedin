"use client";

interface Pair {
  a: string;
  b: string;
  count: number;
}

interface Props {
  data: Pair[];
}

const PAIR_COLORS = ["#00d4aa", "#3b82f6", "#a855f7", "#f59e0b", "#ec4899"];

export default function SkillCooccurrence({ data }: Props) {
  const top = data.slice(0, 18);
  const maxCount = top[0]?.count ?? 1;

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Commonly Paired Skills</div>
      <div
        style={{
          padding: "6px 14px 10px",
          height: "calc(100% - 37px)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "5px",
        }}
      >
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
          const color = PAIR_COLORS[Math.floor(i / 4)] ?? PAIR_COLORS[PAIR_COLORS.length - 1];
          return (
            <div
              key={`${pair.a}-${pair.b}`}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              {/* rank */}
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

              {/* bar + label */}
              <div style={{ flex: 1, position: "relative", height: "16px" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${pct}%`,
                    background: color,
                    opacity: 0.18,
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
                    fontSize: "9px",
                    color: "var(--text)",
                    fontWeight: i < 5 ? 600 : 400,
                    letterSpacing: "0.02em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "90%",
                  }}
                >
                  <span style={{ color }}>{pair.a}</span>
                  <span style={{ color: "var(--muted)", margin: "0 4px" }}>↔</span>
                  <span style={{ color }}>{pair.b}</span>
                </span>
              </div>

              {/* count */}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color,
                  fontWeight: 600,
                  flexShrink: 0,
                  minWidth: "28px",
                  textAlign: "right",
                }}
              >
                {pair.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
