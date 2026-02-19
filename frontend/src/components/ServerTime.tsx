"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

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
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      <span>{serverTime}</span>
    </div>
  );
}
