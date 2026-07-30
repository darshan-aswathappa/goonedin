"use client";

import { X, WarningCircle } from "@phosphor-icons/react";
import { DsButton } from "@/components/ds";

interface ErrorBannerProps {
  error: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  showRetry?: boolean;
}

export function ErrorBanner({
  error,
  onDismiss,
  onRetry,
  showRetry = true,
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="mb-6 rounded-[4px] border border-brick bg-brick-tint p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <WarningCircle
            weight="regular"
            className="mt-0.5 size-4 shrink-0 text-ink-muted"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="break-words font-sans text-[15px] leading-snug text-ink">
              {error}
            </p>
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex size-10 shrink-0 items-center justify-center rounded-[4px] border border-hairline bg-paper-card text-ink-muted transition-colors duration-[120ms] hover:border-brick hover:text-brick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brick/40"
            aria-label="Dismiss error"
          >
            <X weight="regular" className="size-4" />
          </button>
        )}
      </div>

      {showRetry && onRetry && (
        <div className="mt-3 flex gap-2">
          <DsButton variant="primary" size="sm" onClick={onRetry} className="min-h-11 sm:min-h-0">
            Retry
          </DsButton>
        </div>
      )}
    </div>
  );
}
