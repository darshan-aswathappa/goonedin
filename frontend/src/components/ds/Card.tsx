import { cn } from "@/lib/utils";

type StatusTone = "success" | "brand" | "neutral" | "none";

interface DsCardProps extends React.ComponentProps<"div"> {
  /**
   * Top stripe = DATA STATUS. A deliberate signal, distinct from selection.
   * "none" leaves the card unstriped.
   */
  status?: StatusTone;
  /** Left stripe + tinted background = UI SELECTION. */
  selected?: boolean;
  /** Suppress the hover border shift for non-interactive cards. */
  interactive?: boolean;
}

const statusStripe: Record<StatusTone, string> = {
  success: "border-t-[3px] border-t-forest",
  brand: "border-t-[3px] border-t-brick",
  neutral: "border-t-[3px] border-t-hairline-strong",
  none: "",
};

/**
 * Sharp-cornered, hairline-bordered, no resting shadow.
 * Top stripe communicates data status; left stripe communicates selection.
 * When `onClick` is set, the card is keyboard-activatable (Enter/Space).
 */
export function DsCard({
  status = "none",
  selected = false,
  interactive = true,
  className,
  onClick,
  onKeyDown,
  ...props
}: DsCardProps) {
  const isActivable = typeof onClick === "function";

  return (
    <div
      role={isActivable ? "button" : undefined}
      tabIndex={isActivable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || !isActivable) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.currentTarget.click();
        }
      }}
      className={cn(
        "relative rounded-[4px] border border-hairline bg-paper-card transition-colors duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        interactive && !selected && "hover:border-hairline-strong",
        isActivable &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brick/40",
        !selected && statusStripe[status],
        selected &&
          "border-brick-tint bg-brick-tint border-l-[3px] border-l-brick",
        className
      )}
      {...props}
    />
  );
}
