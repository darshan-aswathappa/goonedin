"use client";

import { useJobsStore } from "@/store/jobs";
import {
  Broadcast,
  Prohibit,
  CircleNotch,
} from "@phosphor-icons/react";

export function ConnectionStatus() {
  const connectionStatus = useJobsStore((state) => state.connectionStatus);

  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";

  return (
    <div
      role="status"
      aria-label={isConnected ? "Connected" : isConnecting ? "Reconnecting" : "Disconnected"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        border: `1px solid ${isConnected ? "#ff8c00" : isConnecting ? "#1c1c1c" : "rgba(255,51,51,0.4)"}`,
        background: isConnected ? "rgba(255,140,0,0.08)" : isConnecting ? "transparent" : "rgba(255,51,51,0.05)",
        padding: "0 10px",
        height: "32px",
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        fontWeight: 600,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: isConnected ? "#ff8c00" : isConnecting ? "#555" : "#ff3333",
        flexShrink: 0,
        transition: "border-color 0.2s, color 0.2s",
      }}
    >
      {isConnected && (
        <>
          <Broadcast weight="bold" style={{ width: "12px", height: "12px", flexShrink: 0 }} className="animate-live-pulse" />
          <span>Live</span>
        </>
      )}
      {isConnecting && (
        <>
          <CircleNotch weight="bold" style={{ width: "12px", height: "12px", flexShrink: 0 }} className="animate-spin" />
          <span className="hidden sm:inline">Reconnecting</span>
          <span className="sm:hidden">Sync</span>
        </>
      )}
      {connectionStatus === "disconnected" && (
        <>
          <Prohibit weight="bold" style={{ width: "12px", height: "12px", flexShrink: 0 }} />
          <span className="hidden sm:inline">Disconnected</span>
          <span className="sm:hidden">Off</span>
        </>
      )}
    </div>
  );
}
