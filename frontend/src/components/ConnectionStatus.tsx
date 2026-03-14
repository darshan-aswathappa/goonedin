"use client";

import { useJobsStore } from "@/store/jobs";
import { 
  Broadcast, 
  Prohibit, 
  CircleNotch 
} from "@phosphor-icons/react";

export function ConnectionStatus() {
  const connectionStatus = useJobsStore((state) => state.connectionStatus);

  return (
    <div
      role="status"
      aria-label={connectionStatus === "connected" ? "Connected" : connectionStatus === "connecting" ? "Updating" : "Disconnected"}
      className={`flex items-center gap-1.5 brutal-border px-2 sm:px-3 py-1 font-black text-[9px] sm:text-[10px] uppercase tracking-widest brutal-shadow-md h-10 sm:h-[42px] ${
        connectionStatus === "connected"
          ? "bg-green-50 text-green-700 dark:bg-green-700/20 dark:text-green-400"
          : connectionStatus === "connecting"
          ? "bg-sidebar-accent text-primary"
          : "bg-red-50 text-destructive dark:bg-red-950/30"
      }`}
    >
      {connectionStatus === "connected" && (
        <>
          <Broadcast weight="bold" className="h-3.5 w-3.5 shrink-0 animate-live-pulse" />
          <span>Live</span>
        </>
      )}
      {connectionStatus === "connecting" && (
        <>
          <CircleNotch weight="bold" className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="hidden sm:inline">Reconnecting</span>
          <span className="sm:hidden">Sync</span>
        </>
      )}
      {connectionStatus === "disconnected" && (
        <>
          <Prohibit weight="bold" className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">Disconnected</span>
          <span className="sm:hidden">Off</span>
        </>
      )}
    </div>
  );
}
