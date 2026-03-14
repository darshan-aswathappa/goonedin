"use client";

import { X } from "@phosphor-icons/react";

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
    <div className="brutal-border bg-red-50 dark:bg-red-950/30 border-destructive p-4 mb-6 shadow-[4px_4px_0px_0px_var(--border)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="text-destructive font-black text-lg mt-0.5 shrink-0">⚠️</div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-destructive dark:text-destructive break-words">
              {error}
            </p>
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="shrink-0 p-1 brutal-border bg-card text-destructive hover:bg-destructive hover:text-white transition-all brutal-btn-hover"
            aria-label="Dismiss error"
          >
            <X weight="bold" className="h-5 w-5" />
          </button>
        )}
      </div>

      {showRetry && onRetry && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onRetry}
            className="brutal-border px-4 py-2 font-black text-sm uppercase bg-destructive text-white hover:bg-destructive/90 brutal-btn-hover"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
