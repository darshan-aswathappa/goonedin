"use client";

import React, { useState } from "react";

const TABS = [
  { id: "market", label: "MARKET" },
  { id: "skills", label: "SKILLS" },
  { id: "companies", label: "COMPANIES" },
  { id: "pipeline", label: "POSTINGS" },
  { id: "geo", label: "LOCATIONS" },
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

  return (
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
              cursor: "pointer",
              transition: "all 0.15s",
              textTransform: "uppercase",
              background: isActive ? "var(--teal)" : "transparent",
              color: isActive
                ? "#0a0e14"
                : isHovered
                  ? "var(--text)"
                  : "var(--muted)",
              fontWeight: isActive ? 700 : 400,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
