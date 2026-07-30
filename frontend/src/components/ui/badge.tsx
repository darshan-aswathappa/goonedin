import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-[4px] border border-transparent px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.09em] w-fit whitespace-nowrap shrink-0 max-w-full [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-brick/40 focus-visible:ring-2 aria-invalid:border-brick transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-brick-tint text-brick [a&]:hover:bg-brick-tint/70",
        secondary: "bg-paper-sunk text-ink-muted [a&]:hover:bg-hairline",
        destructive: "bg-brick text-paper-card [a&]:hover:bg-brick-hover",
        outline:
          "border-hairline-strong text-ink-2 [a&]:hover:bg-paper-sunk [a&]:hover:text-ink",
        ghost: "text-ink-muted [a&]:hover:bg-paper-sunk [a&]:hover:text-ink",
        link: "text-brick underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
