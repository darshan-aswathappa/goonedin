"use client";

import { useEffect, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";

interface Props {
  lastUpdated?: Date;
  onRefresh?: () => void;
}

export default function TerminalHeader({ lastUpdated, onRefresh }: Props) {
  const [time, setTime] = useState<string>("");
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
      setDate(
        now.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "2-digit",
        }).toUpperCase()
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-panel)",
        padding: "0 20px",
        height: "44px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: "var(--font-mono)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Left: Identity */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.2em",
            color: "var(--teal)",
          }}
        >
          GOONEDIN
        </span>
        <span
          style={{
            fontSize: "9px",
            letterSpacing: "0.12em",
            color: "var(--muted)",
          }}
        >
          MARKET INTELLIGENCE TERMINAL
        </span>
      </div>

      {/* Center: Live status */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span className="live-dot" />
        <span
          style={{
            fontSize: "9px",
            letterSpacing: "0.18em",
            color: "var(--teal)",
            fontWeight: 600,
          }}
        >
          LIVE
        </span>
        {lastUpdated && (
          <span style={{ fontSize: "9px", color: "var(--muted)", letterSpacing: "0.08em" }}>
            &nbsp;· UPDATED {lastUpdated.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Right: Clock + Refresh */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {onRefresh && (
          <button
            onClick={onRefresh}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--muted)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "9px",
              letterSpacing: "0.1em",
              padding: "4px 8px",
              borderRadius: "var(--radius)",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--teal)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
          >
            <ArrowClockwise size={11} weight="bold" />
            <span>REFRESH</span>
          </button>
        )}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", letterSpacing: "0.05em" }}>
            {time}
          </div>
          <div style={{ fontSize: "8px", color: "var(--muted)", letterSpacing: "0.12em", marginTop: "1px" }}>
            {date}
          </div>
        </div>
      </div>
    </header>
  );
}
