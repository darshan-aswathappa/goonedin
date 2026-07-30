import { cn } from "@/lib/utils";

export type StatusTone = "complete" | "active" | "pending" | "failed";

const dotColor: Record<StatusTone, string> = {
  complete: "bg-forest",
  active: "bg-brick",
  pending: "bg-ink-faint",
  failed: "bg-brick",
};

interface StatusBadgeProps extends React.ComponentProps<"span"> {
  label: string;
  tone?: StatusTone;
  /** Pulse the dot for live/in-flight states. */
  live?: boolean;
}

/**
 * Colored dot + plain mono text. The product communicates state through
 * color and typography, not icons.
 */
export function StatusBadge({
  label,
  tone = "complete",
  live = false,
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px] font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          dotColor[tone],
          live && "animate-live-pulse"
        )}
      />
      {label}
    </span>
  );
}
