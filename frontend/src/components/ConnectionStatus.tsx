"use client";

import { useJobsStore } from "@/store/jobs";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Loader2 } from "lucide-react";

export function ConnectionStatus() {
  const connectionStatus = useJobsStore((state) => state.connectionStatus);

  return (
    <Badge
      variant="outline"
      className={`gap-1.5 ${
        connectionStatus === "connected"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : connectionStatus === "connecting"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
          : "border-red-500/30 bg-red-500/10 text-red-400"
      }`}
    >
      {connectionStatus === "connected" && (
        <>
          <Wifi className="h-3 w-3" />
          <span className="hidden sm:inline">Live</span>
        </>
      )}
      {connectionStatus === "connecting" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="hidden sm:inline">Connecting</span>
        </>
      )}
      {connectionStatus === "disconnected" && (
        <>
          <WifiOff className="h-3 w-3" />
          <span className="hidden sm:inline">Offline</span>
        </>
      )}
    </Badge>
  );
}
