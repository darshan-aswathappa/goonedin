"use client";

import React, { useState, useEffect } from "react";

const TABS = [
  { id: "market", label: "MARKET", shortcut: "1" },
  { id: "skills", label: "SKILLS", shortcut: "2" },
  { id: "companies", label: "COMPANIES", shortcut: "3" },
  { id: "pipeline", label: "POSTINGS", shortcut: "4" },
  { id: "geo", label: "LOCATIONS", shortcut: "5" },
];

interface Props {
  active: string;
  onChange: (id: string) => void;
}

export default function TabNav({ active, onChange }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent, tabId: string) => {
    const currentIndex = TABS.findIndex((t) => t.id === tabId);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onChange(TABS[(currentIndex + 1) % TABS.length].id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(TABS[(currentIndex - 1 + TABS.length) % TABS.length].id);
    }
  };

  // Global number key handler: pressing 1-5 switches tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const idx = parseInt(e.key, 10);
      if (idx >= 1 && idx <= TABS.length) {
        onChange(TABS[idx - 1].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onChange]);

  return (
    <div>
      {/* Command bar */}
      <div className="cmd-bar">
        <span style={{ color: "var(--teal)", fontWeight: 700, letterSpacing: "0.1em" }}>[HIREFEED]</span>
        <span style={{ flex: 1 }} />
        {TABS.map((tab) => (
          <span key={tab.id} style={{ marginRight: "4px" }}>
            <span style={{ color: "var(--border-bright)" }}>[</span>
            <span style={{ color: "var(--teal)" }}>{tab.shortcut}</span>
            <span style={{ color: "var(--border-bright)" }}>]</span>
            <span style={{ marginLeft: "3px" }}>{tab.label}</span>
          </span>
        ))}
        <span style={{ marginLeft: "8px", color: "var(--border-bright)" }}>[?] HELP</span>
      </div>

      {/* Tab row */}
      <div
        role="tablist"
        aria-label="Dashboard sections"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          padding: "0 16px",
          overflowX: "auto",
        }}
      >
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          const isHovered = hovered === tab.id;

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onMouseEnter={() => setHovered(tab.id)}
              onMouseLeave={() => setHovered(null)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                letterSpacing: "0.15em",
                padding: "10px 22px",
                border: "none",
                borderLeft: isActive ? "2px solid var(--teal)" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                background: "transparent",
                color: isActive
                  ? "var(--teal)"
                  : isHovered
                    ? "var(--text)"
                    : "var(--muted)",
                fontWeight: isActive ? 700 : 400,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span className="panel-code">{tab.shortcut}</span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
