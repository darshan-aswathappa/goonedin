"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { Kicker, StatusBadge } from "@/components/ds";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  logger: string;
}

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL?.replace("/ws/jobs", "/ws/logs") ||
  "ws://localhost:8000/ws/logs";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const PING_INTERVAL = 30000;
const MAX_LOGS = 1000;

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const connectWebSocket = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const wsUrl = token ? `${WS_BASE_URL}?token=${token}` : WS_BASE_URL;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (mountedRef.current) {
        setConnected(true);
      }
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      if (event.data === "pong") return;

      try {
        const message = JSON.parse(event.data);
        if (message.type === "LOG" && message.data && mountedRef.current) {
          setLogs((prev) => [...prev.slice(-MAX_LOGS + 1), message.data]);
        }
      } catch (e) {
        console.error("Failed to parse log message:", e);
      }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        setConnected(false);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        const response = await fetch(`${API_URL}/logs`, { headers });
        if (response.ok) {
          const data = await response.json();
          if (mountedRef.current && data.logs) {
            setLogs(data.logs);
          }
        }
      } catch (error) {
        console.error("Failed to fetch historical logs:", error);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          connectWebSocket();
        }
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connectWebSocket]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", { hour12: false });
  };

  /**
   * Log severity reads through ink weight, with the single brick accent
   * reserved for errors and forest for confirmed successes.
   */
  const getLogToneClass = (level: string, message: string): string => {
    if (level === "ERROR") return "text-brick";
    if (level === "WARNING") return "text-ink";

    const msgLower = message.toLowerCase();
    if (
      msgLower.includes("rate limit") ||
      msgLower.includes("throttling") ||
      msgLower.includes("retry")
    ) {
      return "text-ink";
    }
    if (
      msgLower.includes("successful") ||
      msgLower.includes("ok ") ||
      msgLower.includes("online") ||
      msgLower.includes("established") ||
      msgLower.includes("new target")
    ) {
      return "text-forest";
    }
    if (
      msgLower.includes("scanning") ||
      msgLower.includes("pinging") ||
      msgLower.includes("proxy") ||
      msgLower.includes("endpoint")
    ) {
      return "text-ink-muted";
    }
    return "text-ink-2";
  };

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="shell-header shrink-0 bg-paper-card">
        <div className="shell-header-inner">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
              className="shell-back"
            >
              <ArrowLeft className="size-[14px]" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-serif text-[19px] font-semibold leading-none text-ink">
                System log
              </h1>
              <Kicker className="mt-1">Extraction feed</Kicker>
            </div>
          </div>

          <StatusBadge
            label={connected ? "Live" : "Offline"}
            tone={connected ? "complete" : "failed"}
            live={connected}
          />
        </div>
      </header>

      {/* Log panel — sunk well, terminal output */}
      <div
        ref={scrollRef}
        className="ds-well m-3 min-h-0 flex-1 overflow-y-auto rounded-[4px] px-4 py-3 mb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {loading ? (
          <Kicker>Loading logs&hellip;</Kicker>
        ) : logs.length === 0 ? (
          <Kicker>
            No logs yet. Waiting for activity
            <span className="animate-cursor-blink ml-1 text-brick">_</span>
          </Kicker>
        ) : (
          logs.map((log, idx) => (
            <div
              key={idx}
              className="flex gap-3 border-b border-hairline py-1 leading-snug last:border-b-0"
            >
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                [{formatTime(log.timestamp)}]
              </span>
              <span
                className={`break-all font-mono text-[11px] ${getLogToneClass(
                  log.level,
                  log.message
                )}`}
              >
                {log.message}
              </span>
            </div>
          ))
        )}

        {/* Live feed indicator */}
        <div className="mt-2 flex items-center gap-2 border-t border-hairline-strong pt-2">
          <StatusBadge label="Live feed active" tone="complete" live />
          <span className="animate-cursor-blink font-mono text-[11px] text-brick">_</span>
        </div>
      </div>
    </div>
  );
}
