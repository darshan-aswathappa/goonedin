"use client";

import { useState } from "react";

const TABS = [
  { id: "market", label: "MARKET" },
  { id: "skills", label: "SKILLS" },
  { id: "companies", label: "COMPANIES" },
  { id: "pipeline", label: "POSTINGS" },
  { id: "geo", label: "GEO" },
];

interface Props {
  active: string;
  onChange: (id: string) => void;
}

export default function TabNav({ active, onChange }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-panel)",
        padding: "0 16px",
      }}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        const isHovered = hovered === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            onMouseEnter={() => setHovered(tab.id)}
            onMouseLeave={() => setHovered(null)}
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
