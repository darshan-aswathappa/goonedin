"use client";

import { useState, useEffect } from "react";
import { Timer } from "@phosphor-icons/react";

interface ScrapeCountdownProps {
  nextScrapeAt: string | null;
  label?: string;
}

export function ScrapeCountdown({ nextScrapeAt, label = "Next scan" }: ScrapeCountdownProps) {
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
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 border-2 border-black text-xs font-black uppercase tracking-wider ${
      isActive
        ? "bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-300"
        : "bg-muted text-muted-foreground"
    }`}>
      <Timer weight="bold" className={`h-3.5 w-3.5 ${isActive ? "animate-spin" : ""}`} />
      {isActive ? "Scanning..." : `${label} ${display}`}
    </span>
  );
}
