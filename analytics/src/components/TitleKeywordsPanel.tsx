"use client";

interface Props {
  data: { word: string; count: number }[];
}

export default function TitleKeywordsPanel({ data }: Props) {
  const top = data.slice(0, 20);
  const max = top[0]?.count ?? 1;

  // Color scale based on rank
  const getColor = (i: number, count: number) => {
    const pct = count / max;
    if (pct > 0.8) return "var(--purple)";
    if (pct > 0.6) return "var(--teal)";
    if (pct > 0.4) return "var(--blue)";
    return "var(--border-bright)";
  };

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Most Demanded Job Titles</div>
      <div
        style={{
          padding: "10px 12px",
          height: "calc(100% - 37px)",
          overflowY: "auto",
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          alignContent: "flex-start",
        }}
      >
        {top.map((item, i) => {
          const pct = (item.count / max) * 100;
          const color = getColor(i, item.count);
          const fontSize = Math.max(8, Math.min(13, 8 + Math.floor(pct / 12)));
          return (
            <div
              key={item.word}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 7px",
                background: `${color}18`,
                border: `1px solid ${color}40`,
                borderRadius: "var(--radius)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: `${fontSize}px`,
                  color,
                  fontWeight: pct > 60 ? 700 : 400,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {item.word}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--muted)",
                }}
              >
                {item.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
