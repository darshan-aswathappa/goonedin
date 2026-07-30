"use client";

import { useJobsStore } from "@/store/jobs";
import { StatusBadge } from "@/components/ds";
import { cn } from "@/lib/utils";

export function ConnectionStatus() {
  const connectionStatus = useJobsStore((state) => state.connectionStatus);

  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";

  return (
    <div
      role="status"
      aria-label={isConnected ? "Connected" : isConnecting ? "Reconnecting" : "Disconnected"}
      className={cn(
        "inline-flex h-10 shrink-0 items-center rounded-[4px] border px-2.5 transition-colors duration-[180ms]",
        isConnected && "border-hairline bg-forest-tint",
        isConnecting && "border-hairline bg-paper-card",
        connectionStatus === "disconnected" && "border-brick bg-brick-tint"
      )}
    >
      {isConnected && (
        <StatusBadge label="Live" tone="complete" live className="text-forest" aria-hidden />
      )}
      {isConnecting && (
        <>
          <StatusBadge
            label="Reconnecting"
            tone="pending"
            live
            className="hidden sm:inline-flex"
            aria-hidden
          />
          <StatusBadge label="Sync" tone="pending" live className="sm:hidden" aria-hidden />
        </>
      )}
      {connectionStatus === "disconnected" && (
        <>
          <StatusBadge
            label="Disconnected"
            tone="failed"
            className="hidden text-brick sm:inline-flex"
            aria-hidden
          />
          <StatusBadge label="Off" tone="failed" className="text-brick sm:hidden" aria-hidden />
        </>
      )}
    </div>
  );
}
