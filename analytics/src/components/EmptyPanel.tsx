"use client";

interface Props {
  title: string;
  message?: string;
  suggestion?: string;
}

export default function EmptyPanel({
  title,
  message = "No data available yet",
  suggestion = "Data will appear here once jobs are collected and analyzed.",
}: Props) {
  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">{title}</div>
      <div
        style={{
          height: "calc(100% - 37px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          padding: "20px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--muted)",
            letterSpacing: "0.08em",
            textAlign: "center",
          }}
        >
          {message}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "var(--border-bright)",
            letterSpacing: "0.04em",
            textAlign: "center",
            maxWidth: "240px",
            lineHeight: 1.6,
          }}
        >
          {suggestion}
        </div>
        <div style={{ display: "flex", gap: "4px", marginTop: "8px" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: "3px",
                height: "3px",
                borderRadius: "50%",
                background: "var(--muted)",
                animation: `empty-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
