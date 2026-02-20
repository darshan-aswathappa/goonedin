"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  logger: string;
}

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL?.replace("/ws/jobs", "/ws/logs") ||
  "ws://localhost:8000/ws/logs";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

  const fetchHistoricalLogs = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/logs`);
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
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    fetchHistoricalLogs();

    const ws = new WebSocket(WS_URL);
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
  }, [fetchHistoricalLogs]);

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
    <div className="min-h-screen bg-[#0d1117] p-6 font-mono">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-800 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="h-4 w-4 text-gray-400" />
            </Link>
            <h1 className="text-white text-lg font-semibold tracking-wide">
              SYSTEM LOGS
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-gray-500 text-sm">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="bg-[#161b22] rounded-lg border border-gray-800 p-4 h-[calc(100vh-120px)] overflow-y-auto"
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
                <span className={getLogColor(log.level, log.message)}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div className="text-cyan-400 animate-pulse mt-1">
            _cursor active...
          </div>
        </div>
      </div>
    </div>
  );
}
