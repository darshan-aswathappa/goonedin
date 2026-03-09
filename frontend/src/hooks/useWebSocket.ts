"use client";

import { useEffect, useRef, useCallback } from "react";
import { useJobsStore, Job } from "@/store/jobs";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/jobs";
const INITIAL_RECONNECT_INTERVAL = 1000;  // Start at 1s (was 3s)
const MAX_RECONNECT_INTERVAL = 30000;     // Cap at 30s
const PING_INTERVAL = 30000;

interface NewJobMessage {
  type: "NEW_JOB";
  data: Job;
}
interface CompanyBlockedMessage {
  type: "COMPANY_BLOCKED";
  data: { company: string; deleted_job_ids: string[] };
}
interface JobDismissedMessage {
  type: "JOB_DISMISSED";
  data: { external_id: string };
}
interface UpdateJobMessage {
  type: "UPDATE_JOB";
  data: Job;
}
interface CustomSourceStatusMessage {
  type: "CUSTOM_SOURCE_STATUS";
  data: { source_id: string; status: string; message: string };
}

type WebSocketMessage = NewJobMessage | CompanyBlockedMessage | JobDismissedMessage | UpdateJobMessage | CustomSourceStatusMessage;

export function useWebSocket({ enabled = true } = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedEventsRef = useRef<Map<string, number>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const { addJob, removeJob, removeJobsByCompany, updateJob, setConnectionStatus, setSourceStatus } = useJobsStore();

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus("connecting");

    // Get a fresh token on every (re)connect so we never use an expired one
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const wsUrl = token ? `${WS_BASE_URL}?token=${token}` : WS_BASE_URL;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
      reconnectAttemptsRef.current = 0;  // Reset backoff on successful connection
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      if (event.data === "pong") return;
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        const now = Date.now();

        // Create unique key for this event
        const eventKey = `${message.type}:${JSON.stringify(message.data)}`;
        const lastProcessedTime = processedEventsRef.current.get(eventKey);

        // Deduplicate events received within 500ms (prevents duplicate notifications from multiple connections)
        if (lastProcessedTime && now - lastProcessedTime < 500) {
          return; // Skip processing if same event received recently
        }

        processedEventsRef.current.set(eventKey, now);

        // Clean up old entries (older than 1 second) to prevent memory bloat
        for (const [key, timestamp] of processedEventsRef.current.entries()) {
          if (now - timestamp > 1000) {
            processedEventsRef.current.delete(key);
          }
        }

        if (message.type === "NEW_JOB" && message.data) {
          addJob(message.data);
          toast.info(`New ${message.data.source} job: ${message.data.title}`, {
            description: message.data.company,
          });
        } else if (message.type === "COMPANY_BLOCKED" && message.data) {
          removeJobsByCompany(message.data.company);
          const count = message.data.deleted_job_ids.length;
          toast.success(`Blocked: ${message.data.company}`, {
            description: `Removed ${count} job${count !== 1 ? "s" : ""} from all lists`,
          });
        } else if (message.type === "JOB_DISMISSED" && message.data) {
          removeJob(message.data.external_id);
        } else if (message.type === "UPDATE_JOB" && message.data) {
          updateJob(message.data.external_id, message.data);
        } else if (message.type === "CUSTOM_SOURCE_STATUS" && message.data) {
          setSourceStatus(
            message.data.source_id,
            message.data.status,
            message.data.message
          );
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

      // Exponential backoff: 1s, 2s, 4s, 8s... capped at 30s
      const delayMs = Math.min(
        INITIAL_RECONNECT_INTERVAL * Math.pow(2, reconnectAttemptsRef.current),
        MAX_RECONNECT_INTERVAL
      );
      reconnectAttemptsRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(() => connect(), delayMs);
    };

    ws.onerror = () => ws.close();
  }, [addJob, removeJob, removeJobsByCompany, updateJob, setConnectionStatus, setSourceStatus]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [connect, disconnect, enabled]);

  return { connect, disconnect };
}
