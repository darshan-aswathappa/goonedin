import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const dsButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-medium rounded-md border transition-[background-color,border-color,opacity] duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brick/40 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* Solid fill, accent red, white text. */
        primary: "bg-brick border-brick text-paper-card hover:bg-brick-hover hover:border-brick-hover",
        /* Thin-bordered outline on card surface. */
        secondary:
          "bg-paper-card border-hairline-strong text-ink hover:bg-paper-sunk",
        /* Borderless text-only — "Load file". */
        ghost: "bg-transparent border-transparent text-ink-2 hover:text-ink hover:bg-paper-sunk",
        /* Destructive reads as accent red text on a hairline, not a solid alarm. */
        danger:
          "bg-transparent border-hairline-strong text-brick hover:bg-brick-tint hover:border-brick",
      },
      size: {
        md: "px-5 py-2.5 text-[15px]",
        sm: "px-3.5 py-[7px] text-[13px]",
        icon: "size-9 p-0",
        "icon-sm": "size-8 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

type DsButtonProps = React.ComponentProps<"button"> & VariantProps<typeof dsButtonVariants>;

export function DsButton({ className, variant, size, ...props }: DsButtonProps) {
  return (
    <button
      type={props.type ?? "button"}
      className={cn(dsButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { dsButtonVariants };
