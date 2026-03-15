"use client";

import { useState, useEffect } from "react";
import { Timer, CircleNotch } from "@phosphor-icons/react";

interface ScrapeCountdownProps {
  nextScrapeAt: string | null;
  label?: string;
}

export function ScrapeCountdown({ nextScrapeAt, label = "NEXT UPDATE IN" }: ScrapeCountdownProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!nextScrapeAt) {
      setSecondsLeft(null);
      return;
    }

    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(nextScrapeAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [nextScrapeAt]);

  if (secondsLeft === null) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const display = mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
  const isActive = secondsLeft === 0;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        fontWeight: 600,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        border: `1px solid ${isActive ? "rgba(74,222,128,0.3)" : "#1c1c1c"}`,
        background: isActive ? "rgba(74,222,128,0.06)" : "#080808",
        color: isActive ? "#4ade80" : "#555",
        padding: "2px 8px",
      }}
    >
      {isActive ? (
        <CircleNotch weight="bold" style={{ width: "10px", height: "10px", flexShrink: 0 }} className="animate-spin" />
      ) : (
        <Timer weight="bold" style={{ width: "10px", height: "10px", flexShrink: 0 }} />
      )}
      {isActive ? "CHECKING NOW..." : `${label} ${display}`}
    </span>
  );
}
