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
      className={`flex items-center gap-2 brutal-border px-3 py-1 font-black text-[10px] uppercase tracking-widest shadow-[2px_2px_0px_0px_var(--border)] h-[42px] ${
        connectionStatus === "connected"
          ? "bg-[#E6F4EA] text-[#009063] dark:bg-[#009063] dark:text-white"
          : connectionStatus === "connecting"
          ? "bg-[#FDEBD0] text-[#F15152]"
          : "bg-[#FFEBEB] text-[#D72638]"
      }`}
    >
      {connectionStatus === "connected" && (
        <>
          <Broadcast weight="bold" className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Live</span>
        </>
      )}
      {connectionStatus === "connecting" && (
        <>
          <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" />
          <span className="hidden sm:inline">Syncing</span>
        </>
      )}
      {connectionStatus === "disconnected" && (
        <>
          <Prohibit weight="bold" className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Offline</span>
        </>
      )}
    </div>
  );
}
