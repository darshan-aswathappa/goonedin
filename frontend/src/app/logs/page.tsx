"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";

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

  const getLogColor = (level: string, message: string) => {
    if (level === "ERROR") return "text-red-400";
    if (level === "WARNING") return "text-yellow-400";

    const msgLower = message.toLowerCase();
    if (
      msgLower.includes("rate limit") ||
      msgLower.includes("throttling") ||
      msgLower.includes("retry")
    ) {
      return "text-yellow-400";
    }
    if (
      msgLower.includes("successful") ||
      msgLower.includes("ok ") ||
      msgLower.includes("online") ||
      msgLower.includes("established") ||
      msgLower.includes("new target")
    ) {
      return "text-green-400";
    }
    if (
      msgLower.includes("scanning") ||
      msgLower.includes("pinging") ||
      msgLower.includes("proxy") ||
      msgLower.includes("endpoint")
    ) {
      return "text-cyan-400";
    }
    return "text-gray-400";
  };

  return (
    <div className="h-screen bg-background p-4 sm:p-6 font-mono text-foreground flex flex-col">
      <div className="max-w-5xl mx-auto flex flex-col flex-1 min-h-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="brutal-border flex h-10 w-10 items-center justify-center bg-card hover:bg-muted transition-all shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              title="Back to Dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black italic uppercase tracking-tighter leading-none">
                System Logs
              </h1>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                Real-time job extraction feed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 brutal-border bg-card px-4 py-2 shadow-[4px_4px_0px_0px_var(--border)]">
            <span
              className={`w-3 h-3 rounded-full ${
                connected ? "bg-[#009063] animate-pulse" : "bg-[#D72638]"
              }`}
            />
            <span className="text-xs font-black uppercase tracking-widest">
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="bg-card border-2 border-border shadow-[8px_8px_0px_0px_var(--border)] p-6 flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
        >
          {loading ? (
            <p className="text-gray-500">Loading logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-gray-500">No logs yet. Waiting for activity...</p>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="flex gap-2 py-0.5 text-sm">
                <span className="text-gray-500 shrink-0">
                  [{formatTime(log.timestamp)}]
                </span>
                <span className={`${getLogColor(log.level, log.message)} break-words break-all`}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div className="mt-4 flex items-center gap-2 text-primary font-black animate-pulse text-xs">
            <span className="w-2 h-2 bg-primary rounded-full" />
            LIVE FEED ACTIVE
          </div>
        </div>
      </div>
    </div>
  );
}
