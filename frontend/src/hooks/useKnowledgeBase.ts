"use client";

/**
 * useKnowledgeBase — React hook for the GoOneIn AI knowledge base.
 *
 * Uses POST /knowledge-base/query with text/event-stream (SSE) via
 * fetch() + ReadableStream — NOT EventSource, because EventSource is
 * GET-only and cannot carry a JSON request body.
 *
 * Streaming event sequence from the server:
 *   data: {"type":"status","message":"Classifying your question..."}
 *   data: {"type":"status","message":"Querying the database..."}
 *   data: {"type":"chunk","text":"Python leads..."}
 *   data: {"type":"chunk","text":" with 42 postings..."}
 *   data: {"type":"done","session_id":"...","rows_returned":42,"query_plan":{...}}
 *
 * Exposed API:
 *   sendMessage(question)  — sends a question, streams response into messages
 *   messages               — full conversation history for this session
 *   isStreaming            — true while chunks are arriving
 *   currentStatus          — human-readable phase label
 *   sessionId              — current session UUID (pass back on follow-ups)
 *   clearSession           — reset history and rotate to a fresh session
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { getAuthHeaders } from "@/hooks/useAuth";
import { ChatMessage, QueryPlan, StreamEvent } from "@/types/knowledge-base";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseSSELine(line: string): StreamEvent | null {
  if (!line.startsWith("data: ")) return null;
  const raw = line.slice(6).trim();
  if (!raw || raw === "[DONE]") return null;
  try {
    return JSON.parse(raw) as StreamEvent;
  } catch {
    return null;
  }
}

export function useKnowledgeBase() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  // Keep refs in sync with state
  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Abort in-flight stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const sendMessage = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed || isStreamingRef.current) return;

    // Append user message immediately
    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    // Placeholder assistant message (streaming in progress)
    const assistantId = generateId();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setIsStreaming(true);
    setCurrentStatus(null);

    abortRef.current = new AbortController();

    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${API_URL}/knowledge-base/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          message: trimmed,
          session_id: sessionIdRef.current,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body for SSE stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let finalQueryPlan: QueryPlan | undefined;
      let newSessionId: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          const event = parseSSELine(trimmedLine);
          if (!event) continue;

          if (event.type === "status" && event.message) {
            setCurrentStatus(event.message);
          } else if (event.type === "chunk" && event.text) {
            accumulated += event.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: accumulated }
                  : m
              )
            );
          } else if (event.type === "done") {
            finalQueryPlan = event.query_plan
              ? (event.query_plan as QueryPlan)
              : undefined;
            newSessionId = event.session_id ?? undefined;
          } else if (event.type === "error") {
            throw new Error(event.error ?? "Stream error from server");
          }
        }
      }

      // Persist the session_id returned by the server for subsequent messages
      if (newSessionId) {
        setSessionId(newSessionId);
      }

      // Finalize the assistant message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: accumulated || "(No response)",
                isStreaming: false,
                queryPlan: finalQueryPlan,
              }
            : m
        )
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, isStreaming: false, content: m.content || "(cancelled)" }
              : m
          )
        );
      } else {
        const errorText =
          err instanceof Error ? err.message : "Unknown error occurred";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  isStreaming: false,
                  content: `ERROR: ${errorText}`,
                }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      setCurrentStatus(null);
      abortRef.current = null;
    }
  }, []);

  const clearSession = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setCurrentStatus(null);
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  return {
    sendMessage,
    messages,
    isStreaming,
    currentStatus,
    sessionId,
    setSessionId,
    clearSession,
  };
}
