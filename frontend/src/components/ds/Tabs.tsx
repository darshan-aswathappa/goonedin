"use client";

import { cn } from "@/lib/utils";

interface DsTabsProps<T extends string> {
  items: readonly T[];
  active: T;
  onChange: (item: T) => void;
  /** Optional trailing counts keyed by item. */
  counts?: Partial<Record<T, number>>;
  className?: string;
}

/**
 * Mono uppercase kickers on a hairline rule, active item marked by a 2px
 * accent underline. No pills, no filled backgrounds.
 */
export function DsTabs<T extends string>({
  items,
  active,
  onChange,
  counts,
  className,
}: DsTabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-6 overflow-x-auto border-b border-hairline scrollbar-hide",
        className
      )}
    >
      {items.map((item) => {
        const isActive = item === active;
        return (
          <button
            key={item}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item)}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 pb-3 font-mono text-[11px] uppercase tracking-[0.09em] transition-colors duration-[120ms]",
              isActive
                ? "border-brick text-ink"
                : "border-transparent text-ink-muted hover:text-ink-2"
            )}
          >
            {item}
            {counts?.[item] !== undefined && (
              <span className="ml-2 text-ink-faint">{counts[item]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
