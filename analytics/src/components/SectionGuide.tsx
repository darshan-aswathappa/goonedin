"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "goonedin-section-guides-dismissed";

interface Props {
  label: string;
  description: string;
}

export default function SectionGuide({ label, description }: Props) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) setDismissed(false);
  }, []);

  if (dismissed) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "4px 4px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "8px",
          fontWeight: 700,
          letterSpacing: "0.2em",
          color: "var(--teal)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          height: "1px",
          background: "var(--border)",
        }}
      />
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "8px",
          letterSpacing: "0.06em",
          color: "var(--muted)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {description}
      </div>
    </div>
  );
}
