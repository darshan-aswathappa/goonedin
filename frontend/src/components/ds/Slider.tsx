"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface SliderProps extends Omit<React.ComponentProps<"input">, "type" | "value"> {
  label: string;
  value: number;
  min?: number;
  max?: number;
  help?: string;
}

/**
 * Thin flat track, solid red fill, red circular thumb with a paper halo.
 * No glow, no bounce. Value reads in the serif voice.
 */
export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  help,
  className,
  ...props
}: SliderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="flex items-center gap-2 font-sans text-[15px] text-ink">
          {label}
          {help && (
            <span
              title={help}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[11px] leading-none text-ink-muted"
            >
              ?
            </span>
          )}
        </label>
        <span className="font-serif text-[17px] tabular-nums text-ink">{value}</span>
      </div>

      <div className="relative h-4">
        <div className="absolute top-1.5 h-1 w-full rounded-full bg-hairline-strong" />
        <div
          className="absolute top-1.5 h-1 rounded-full bg-brick"
          style={{ width: `${pct}%` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 size-4 rounded-full border-2 border-paper-card bg-brick shadow-[0_1px_2px_rgba(28,27,25,0.05)]"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={value}
          className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent opacity-0"
          {...props}
        />
      </div>
    </div>
  );
}
