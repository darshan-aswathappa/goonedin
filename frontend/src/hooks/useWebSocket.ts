"use client";

import { useEffect, useRef, useCallback } from "react";
import { useJobsStore, Job } from "@/store/jobs";
import { toast } from "sonner";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/jobs";
const RECONNECT_INTERVAL = 3000;
const PING_INTERVAL = 30000;

interface NewJobMessage {
  type: "NEW_JOB";
  data: Job;
}

interface JobRemovedMessage {
  type: "JOB_REMOVED";
  data: {
    external_id: string;
    company: string;
  };
}

type WebSocketMessage = NewJobMessage | JobRemovedMessage;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { addJob, removeJob, setConnectionStatus } = useJobsStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");

      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      if (event.data === "pong") return;

      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        if (message.type === "NEW_JOB" && message.data) {
          addJob(message.data);
          toast.info(`New ${message.data.source} job: ${message.data.title}`, {
            description: message.data.company,
          });
        } else if (message.type === "JOB_REMOVED" && message.data) {
          removeJob(message.data.external_id);
          toast.success(`Blocked company: ${message.data.company}`, {
            description: "Job removed from all lists",
          });
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, RECONNECT_INTERVAL);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      ws.close();
    };
  }, [addJob, removeJob, setConnectionStatus]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { connect, disconnect };
}
