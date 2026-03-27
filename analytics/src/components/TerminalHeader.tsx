"use client";

import { useEffect, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";

interface Props {
  lastUpdated?: Date;
  onRefresh?: () => void;
}

const TICKER_ITEMS = [
  { label: "TOTAL JOBS", value: "1,247" },
  { label: "AVG SALARY", value: "$142K" },
  { label: "TOP SKILL", value: "Python", change: "+12%", up: true },
  { label: "HIRING CO", value: "Google", count: "89" },
  { label: "NEW TODAY", value: "43", change: "+8%", up: true },
  { label: "VISA RATE", value: "34%" },
  { label: "REMOTE", value: "61%", change: "+3%", up: true },
  { label: "AVG EXP", value: "4.2 YRS" },
];

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
        }),
      );
      setDate(
        now
          .toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "2-digit",
          })
          .toUpperCase(),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "var(--bg-panel)",
      }}
    >
      {/* Main header bar */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          padding: "0 20px",
          height: "44px",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          fontFamily: "var(--font-mono)",
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
            HIREFEED
          </span>
          <span
            className="header-subtitle"
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            justifyContent: "center",
          }}
        >
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
            <span
              style={{
                fontSize: "9px",
                color: "var(--muted)",
                letterSpacing: "0.08em",
              }}
            >
              &nbsp;· UPDATED{" "}
              {lastUpdated.toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {/* Right: Shortcuts + Clock + Refresh */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            justifyContent: "flex-end",
          }}
        >
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
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--teal)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--muted)")
              }
            >
              <ArrowClockwise size={11} weight="bold" />
              <span>REFRESH</span>
            </button>
          )}
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "var(--text)",
                letterSpacing: "0.05em",
              }}
            >
              {time}
            </div>
            <div
              style={{
                fontSize: "8px",
                color: "var(--muted)",
                letterSpacing: "0.12em",
                marginTop: "1px",
              }}
            >
              {date}
            </div>
          </div>
        </div>
      </header>

      {/* Ticker strip */}
      <div className="ticker-strip">
        <div className="ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <div key={i} className="ticker-item">
              <span style={{ color: "var(--muted)", marginRight: "4px" }}>
                {item.label}:
              </span>
              <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>
                {item.value}
              </span>
              {item.change && (
                <span
                  className={item.up ? "up" : "down"}
                  style={{ marginLeft: "4px" }}
                >
                  {item.up ? "▲" : "▼"} {item.change}
                </span>
              )}
              {item.count && (
                <span style={{ color: "var(--muted)", marginLeft: "4px" }}>
                  ({item.count})
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
