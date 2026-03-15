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
  const [backHovered, setBackHovered] = useState(false);
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

  const getLogColor = (level: string, message: string): string => {
    if (level === "ERROR") return "#ff3333";
    if (level === "WARNING") return "#ffd700";

    const msgLower = message.toLowerCase();
    if (
      msgLower.includes("rate limit") ||
      msgLower.includes("throttling") ||
      msgLower.includes("retry")
    ) {
      return "#ffd700";
    }
    if (
      msgLower.includes("successful") ||
      msgLower.includes("ok ") ||
      msgLower.includes("online") ||
      msgLower.includes("established") ||
      msgLower.includes("new target")
    ) {
      return "#ff8c00";
    }
    if (
      msgLower.includes("scanning") ||
      msgLower.includes("pinging") ||
      msgLower.includes("proxy") ||
      msgLower.includes("endpoint")
    ) {
      return "#00bfff";
    }
    return "#555";
  };

  return (
    <div
      style={{
        height: "100vh",
        background: "#000",
        padding: "0",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-mono)",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: "44px",
          background: "#060606",
          borderBottom: "1px solid #1c1c1c",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          flexShrink: 0,
        }}
      >
        {/* Left: back button + title */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/">
            <div
              onMouseEnter={() => setBackHovered(true)}
              onMouseLeave={() => setBackHovered(false)}
              style={{
                width: "28px",
                height: "28px",
                border: backHovered ? "1px solid #ff8c00" : "1px solid #1c1c1c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: backHovered ? "#ff8c00" : "#555",
                cursor: "pointer",
                transition: "border-color 0.1s, color 0.1s",
              }}
              title="Back to Dashboard"
            >
              <ArrowLeft style={{ width: "14px", height: "14px" }} />
            </div>
          </Link>
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.2em",
                color: "#ff8c00",
                textTransform: "uppercase",
              }}
            >
              SYSTEM LOGS
            </div>
            <div
              style={{
                fontSize: "9px",
                letterSpacing: "0.12em",
                color: "#555",
                marginTop: "1px",
              }}
            >
              REAL-TIME JOB EXTRACTION FEED
            </div>
          </div>
        </div>

        {/* Right: connection status */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: connected ? "#ff8c00" : "#ff3333",
              display: "inline-block",
            }}
            className={connected ? "animate-live-pulse" : ""}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              letterSpacing: "0.18em",
              color: connected ? "#ff8c00" : "#ff3333",
              textTransform: "uppercase",
            }}
          >
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Log panel */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          background: "#000",
          overflowY: "auto",
          padding: "12px 16px",
        }}
      >
        {loading ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "#555",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            LOADING LOGS...
          </div>
        ) : logs.length === 0 ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "#555",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            NO LOGS YET. WAITING FOR ACTIVITY...
          </div>
        ) : (
          logs.map((log, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                gap: "12px",
                padding: "2px 0",
                lineHeight: 1.4,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "#555",
                  flexShrink: 0,
                  letterSpacing: "0.05em",
                }}
              >
                [{formatTime(log.timestamp)}]
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: getLogColor(log.level, log.message),
                  wordBreak: "break-all",
                }}
              >
                {log.message}
              </span>
            </div>
          ))
        )}

        {/* Live feed indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginTop: "8px",
            paddingTop: "8px",
            borderTop: "1px solid #1c1c1c",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              background: "#ff8c00",
              borderRadius: "50%",
            }}
            className="animate-live-pulse"
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "#ff8c00",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            LIVE FEED ACTIVE
          </span>
        </div>
      </div>
    </div>
  );
}
