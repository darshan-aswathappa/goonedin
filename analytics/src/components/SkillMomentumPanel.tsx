"use client";

interface MomentumEntry {
  skill: string;
  recent: number;
  prior: number;
  delta: number;
}

interface Props {
  rising: MomentumEntry[];
  declining: MomentumEntry[];
}

function SkillRow({
  entry,
  rank,
  maxDelta,
  direction,
}: {
  entry: MomentumEntry;
  rank: number;
  maxDelta: number;
  direction: "rising" | "declining";
}) {
  const absDelta = Math.abs(entry.delta);
  const barPct = maxDelta > 0 ? (absDelta / maxDelta) * 100 : 0;
  const badgeColor = direction === "rising" ? "#4ade80" : "#ef4444";
  const barColor = direction === "rising" ? "#00d4aa" : "#ef4444";
  const sign = direction === "rising" ? "+" : "";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
        {rank}
      </span>
      <div style={{ flex: 1, position: "relative", height: "14px" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${barPct}%`,
            background: barColor,
            opacity: 0.15,
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
            fontWeight: rank <= 3 ? 600 : 400,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
          }}
        >
          {entry.skill}
        </span>
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "8px",
          color: "var(--text-dim)",
          flexShrink: 0,
          minWidth: "28px",
          textAlign: "right",
        }}
      >
        {entry.recent}/{entry.prior}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: badgeColor,
          fontWeight: 600,
          flexShrink: 0,
          minWidth: "28px",
          textAlign: "right",
        }}
      >
        {sign}{entry.delta}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        color: "var(--muted)",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
    >
      Awaiting 14+ days of data
    </div>
  );
}

export default function SkillMomentumPanel({ rising, declining }: Props) {
  const hasData = rising.length > 0 || declining.length > 0;
  const risingMax = rising.length > 0 ? Math.abs(rising[0].delta) : 1;
  const decliningMax = declining.length > 0 ? Math.abs(declining[0].delta) : 1;

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Skill Momentum</div>
      <div
        style={{
          padding: "10px 14px",
          height: "calc(100% - 37px)",
          overflowY: "auto",
        }}
      >
        {!hasData ? (
          <EmptyState />
        ) : (
          <div style={{ display: "flex", gap: "16px", height: "100%" }}>
            {/* Rising column */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "3px" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--teal)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: "4px",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Rising</span>
                <span style={{ color: "var(--muted)", fontSize: "7px", letterSpacing: "0.05em" }}>
                  now/prev
                </span>
              </div>
              {rising.length > 0 ? (
                rising.map((entry, i) => (
                  <SkillRow
                    key={entry.skill}
                    entry={entry}
                    rank={i + 1}
                    maxDelta={risingMax}
                    direction="rising"
                  />
                ))
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    color: "var(--muted)",
                  }}
                >
                  No rising skills detected
                </span>
              )}
            </div>

            {/* Divider */}
            <div
              style={{
                width: "1px",
                background: "var(--border)",
                flexShrink: 0,
              }}
            />

            {/* Declining column */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "3px" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "#f59e0b",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: "4px",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Declining</span>
                <span style={{ color: "var(--muted)", fontSize: "7px", letterSpacing: "0.05em" }}>
                  now/prev
                </span>
              </div>
              {declining.length > 0 ? (
                declining.map((entry, i) => (
                  <SkillRow
                    key={entry.skill}
                    entry={entry}
                    rank={i + 1}
                    maxDelta={decliningMax}
                    direction="declining"
                  />
                ))
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    color: "var(--muted)",
                  }}
                >
                  No declining skills detected
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
