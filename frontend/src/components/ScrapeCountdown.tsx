"use client";

import { useState, useEffect } from "react";
import { Timer, CircleNotch } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

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
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.09em]",
        isActive
          ? "border-hairline bg-forest-tint text-forest"
          : "border-hairline bg-paper-sunk text-ink-muted"
      )}
    >
      {isActive ? (
        <CircleNotch weight="regular" className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <Timer weight="regular" className="size-3.5 shrink-0" />
      )}
      {isActive ? "Checking now" : `${label} ${display}`}
    </span>
  );
}
