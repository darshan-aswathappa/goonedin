"use client";

import { useEffect, useState, useRef } from "react";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  logger: string;
}

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL?.replace("/ws/jobs", "/ws/logs") ||
  "ws://localhost:8000/ws/logs";

const RECONNECT_INTERVAL = 3000;
const PING_INTERVAL = 30000;
const MAX_LOGS = 500;

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
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
          if (message.type === "LOG" && message.data) {
            setLogs((prev) => [...prev.slice(-MAX_LOGS + 1), message.data]);
          }
        } catch (e) {
          console.error("Failed to parse log message:", e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_INTERVAL);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

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
          <h1 className="text-white text-lg font-semibold tracking-wide">
            SYSTEM LOGS
          </h1>
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
          {logs.length === 0 ? (
            <p className="text-gray-500">Waiting for logs...</p>
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
