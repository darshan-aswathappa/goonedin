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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[min(88dvh,88vh)] w-[min(92vw,calc(100%-1.5rem))] max-w-[760px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[10px] border border-hairline bg-paper p-5 shadow-[var(--shadow-modal)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 sm:p-8",
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 sm:gap-6">
            <div className="min-w-0">
              {kicker && <Kicker className="mb-2">{kicker}</Kicker>}
              <DialogPrimitive.Title className="font-serif text-[22px] font-semibold leading-tight text-ink sm:text-[28px]">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-2 max-w-[520px] font-sans text-[15px] leading-relaxed text-ink-2 sm:mt-3">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="touch-target -mr-1 -mt-1 flex shrink-0 items-center justify-center rounded-[4px] text-ink-muted transition-colors hover:bg-paper-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brick/40"
            >
              <X className="size-[18px]" />
            </DialogPrimitive.Close>
          </div>

          {children && (
            <div className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-hairline pt-5 sm:mt-6 sm:pt-6">
              {children}
            </div>
          )}

          {footer && (
            <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 border-t border-hairline pt-5 sm:mt-6 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:pt-6">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
