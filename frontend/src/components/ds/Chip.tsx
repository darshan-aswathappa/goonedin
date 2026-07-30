import { cn } from "@/lib/utils";

interface ChipProps extends React.ComponentProps<"span"> {
  tone?: "default" | "accent" | "success" | "sunk";
}

const tones = {
  default: "bg-paper-card border-hairline text-ink-2",
  accent: "bg-brick-tint border-brick-tint text-brick",
  success: "bg-forest-tint border-forest-tint text-forest",
  sunk: "bg-paper-sunk border-hairline text-ink-muted",
} as const;

/** Mono skill/keyword tag. Small radius, never pill-shaped. */
export function Chip({ tone = "default", className, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] border px-3 py-1.5 font-mono text-[13px] leading-none",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
