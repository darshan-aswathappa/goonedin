"use client";

import { cn } from "@/lib/utils";

interface CheckboxProps extends Omit<React.ComponentProps<"input">, "type"> {
  label: React.ReactNode;
  /** Tiny circular "?" glyph — the system's only inline-help affordance. */
  help?: string;
}

export function Checkbox({ label, help, className, checked, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        "group flex cursor-pointer items-center gap-3 font-sans text-[15px] text-ink",
        props.disabled && "cursor-default opacity-50",
        className
      )}
    >
      <input type="checkbox" checked={checked} className="peer sr-only" {...props} />
      <span
        aria-hidden
        className={cn(
          "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-[120ms]",
          checked
            ? "border-brick bg-brick"
            : "border-hairline-strong bg-paper-card group-hover:border-ink-muted"
        )}
      >
        {checked && <span className="size-2 bg-paper-card" />}
      </span>
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
  );
}
