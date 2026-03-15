"use client";

import { useEffect, useRef, useCallback } from "react";
import { useJobsStore, Job } from "@/store/jobs";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/jobs";
const INITIAL_RECONNECT_INTERVAL = 1000;
const MAX_RECONNECT_INTERVAL = 30000;
const PING_INTERVAL = 30000;
const CONNECTION_TIMEOUT = 10000;

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
interface ScrapeCycleMessage {
  type: "SCRAPE_CYCLE";
  data: { scraper: string; next_scrape_at: string };
}

type WebSocketMessage =
  | NewJobMessage
  | CompanyBlockedMessage
  | JobDismissedMessage
  | UpdateJobMessage
  | CustomSourceStatusMessage
  | ScrapeCycleMessage;

export function useWebSocket({ enabled = true } = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedEventsRef = useRef<Map<string, number>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const {
    addJob,
    removeJob,
    removeJobsByCompany,
    updateJob,
    setConnectionStatus,
    setSourceStatus,
    setNextScrape,
  } = useJobsStore();

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Close any lingering connection (e.g. in CONNECTING or CLOSING state)
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus("connecting");

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const wsUrl = token ? `${WS_BASE_URL}?token=${token}` : WS_BASE_URL;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Connection timeout: close if not connected within 10s
    const connectionTimeoutRef = { current: setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.warn("WebSocket connection timeout after 10s");
        ws.close();
      }
    }, CONNECTION_TIMEOUT) };

    ws.onopen = () => {
      clearTimeout(connectionTimeoutRef.current);
      setConnectionStatus("connected");
      reconnectAttemptsRef.current = 0;
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      if (event.data === "pong") return;
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        const now = Date.now();

        // Use ID-based key for deduplication to reduce memory usage
        const eventKey = message.type === "NEW_JOB" ?
          `${message.type}:${message.data.external_id}` :
          message.type === "JOB_DISMISSED" ?
          `${message.type}:${message.data.external_id}` :
          message.type === "UPDATE_JOB" ?
          `${message.type}:${message.data.external_id}` :
          `${message.type}:${JSON.stringify(message.data)}`;

        const lastProcessedTime = processedEventsRef.current.get(eventKey);

        // Deduplicate events within 500ms to prevent duplicate notifications from multiple connections
        if (lastProcessedTime && now - lastProcessedTime < 500) {
          return;
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
          const titlePreview = message.data.title.substring(0, 40) +
            (message.data.title.length > 40 ? "..." : "");
          const companyPreview = message.data.company.substring(0, 30) +
            (message.data.company.length > 30 ? "..." : "");
          toast.info(`New ${message.data.source} job: ${titlePreview}`, {
            description: companyPreview,
          });
        } else if (message.type === "COMPANY_BLOCKED" && message.data) {
          removeJobsByCompany(message.data.company);
          const companyPreview = message.data.company.substring(0, 40) +
            (message.data.company.length > 40 ? "..." : "");
          toast.success(`Blocked: ${companyPreview}`, {
            description: "Future jobs from this company will be hidden",
            id: `blocked-${message.data.company}`,
          });
        } else if (message.type === "JOB_DISMISSED" && message.data) {
          removeJob(message.data.external_id);
        } else if (message.type === "UPDATE_JOB" && message.data) {
          updateJob(message.data.external_id, message.data);
        } else if (message.type === "CUSTOM_SOURCE_STATUS" && message.data) {
          setSourceStatus(
            message.data.source_id,
            message.data.status,
            message.data.message,
          );
        } else if (message.type === "SCRAPE_CYCLE" && message.data) {
          setNextScrape(message.data.scraper, message.data.next_scrape_at);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      clearTimeout(connectionTimeoutRef.current);
      setConnectionStatus("disconnected");
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

      const delayMs = Math.min(
        INITIAL_RECONNECT_INTERVAL * Math.pow(2, reconnectAttemptsRef.current),
        MAX_RECONNECT_INTERVAL,
      );
      reconnectAttemptsRef.current += 1;
      // eslint-disable-next-line react-hooks/immutability
      reconnectTimeoutRef.current = setTimeout(() => {
        // connect is available here as this setTimeout fires after useCallback definition
        void connect();
      }, delayMs);
    };

    ws.onerror = (event) => {
      console.error("WebSocket error:", event);
      clearTimeout(connectionTimeoutRef.current);
      ws.close();
    };
  }, [
    addJob,
    removeJob,
    removeJobsByCompany,
    updateJob,
    setConnectionStatus,
    setSourceStatus,
    setNextScrape,
  ]);

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
