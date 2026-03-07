"use client";

import { useState, useEffect } from "react";
import { Clock } from "@phosphor-icons/react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function ServerTime() {
  const [serverTime, setServerTime] = useState<string | null>(null);

  useEffect(() => {
    const fetchServerTime = async () => {
      try {
        const res = await fetch(`${API_BASE}/server-time`);
        if (res.ok) {
          const data = await res.json();
          setServerTime(data.formatted);
        }
      } catch (error) {
        console.error("Failed to fetch server time:", error);
      }
    };

    fetchServerTime();
    const interval = setInterval(fetchServerTime, 10000);

    return () => clearInterval(interval);
  }, []);

  if (!serverTime) return null;

  return (
    <div className="hidden md:flex items-center gap-2 brutal-border bg-white px-3 py-1 font-black text-[10px] uppercase tracking-widest shadow-[2px_2px_0px_0px_#000000]">
      <Clock weight="bold" className="h-4 w-4 text-[#F15152]" />
      <span>{serverTime}</span>
    </div>
  );
}
