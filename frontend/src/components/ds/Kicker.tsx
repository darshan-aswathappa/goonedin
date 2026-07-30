import { cn } from "@/lib/utils";

type KickerProps = Omit<React.ComponentPropsWithoutRef<"div">, "ref"> & {
  /** Optional trailing count, rendered muted after the label — "RESUMES 3". */
  count?: number | string;
  as?: "div" | "span" | "label" | "h2" | "h3";
  /** Valid only when `as="label"` — associates the kicker with a field. */
  htmlFor?: string;
};

/**
 * The terse all-caps mono label that runs throughout Hirefeed — section
 * headers, field labels, status text, filenames. The connective tissue of
 * the design system's structural voice.
 */
export function Kicker({ children, count, as = "div", className, ...props }: KickerProps) {
  const Tag = as as React.ElementType;
  return (
    <Tag
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted",
        className
      )}
      {...props}
    >
      {children}
      {count !== undefined && <span className="ml-2 text-ink-faint">{count}</span>}
    </Tag>
  );
}
