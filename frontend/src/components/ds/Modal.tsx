"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Kicker } from "./Kicker";

interface DsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Terse all-caps mono label above the title — "NEW APPLICATION". */
  kicker?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Paper-surfaced overlay on a warm ink scrim. Kicker + serif title +
 * sans description, divided from the body by a hairline rule.
 */
export function DsModal({
  open,
  onOpenChange,
  kicker,
  title,
  description,
  children,
  footer,
  className,
}: DsModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(28,27,25,0.35)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[92vw] max-w-[760px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[10px] border border-hairline bg-paper p-8 shadow-[0_24px_64px_rgba(28,27,25,0.22)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
            className
          )}
        >
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              {kicker && <Kicker className="mb-2">{kicker}</Kicker>}
              <DialogPrimitive.Title className="font-serif text-[28px] font-semibold leading-tight text-ink">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-3 max-w-[520px] font-sans text-[15px] leading-relaxed text-ink-2">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="-mr-1 -mt-1 shrink-0 rounded-[4px] p-1 text-ink-muted transition-colors hover:bg-paper-sunk hover:text-ink"
            >
              <X className="size-[18px]" />
            </DialogPrimitive.Close>
          </div>

          {children && (
            <div className="mt-6 min-h-0 flex-1 overflow-y-auto border-t border-hairline pt-6">
              {children}
            </div>
          )}

          {footer && (
            <div className="mt-6 flex shrink-0 items-center justify-end gap-3 border-t border-hairline pt-6">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
