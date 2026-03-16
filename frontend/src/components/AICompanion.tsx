"use client";

import { useEffect, useRef, useState } from "react";
import { useKnowledgeBase } from "@/hooks/useKnowledgeBase";
import { ChatMessage, QueryPlan } from "@/types/knowledge-base";

// ── Suggested prompts shown when conversation is empty ────────────────────────
const SUGGESTED_PROMPTS = [
  "What companies are hiring the most?",
  "Show me remote Python jobs posted today",
  "What's the salary range for ML engineers?",
  "Which job sources are most active?",
];

// ── Shared style constants (avoid new objects per render) ─────────────────────
const MONO_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const MONO_BODY_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "12px",
  lineHeight: 1.65,
  color: "#e8e8e8",
  letterSpacing: "0.02em",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

// ── Query plan badge ──────────────────────────────────────────────────────────
function QueryBadge({ plan }: { plan: QueryPlan }) {
  const labels: Record<string, string> = {
    sql: "SQL",
    vector: "VECTOR",
    hybrid: "HYBRID",
    none: "NONE",
  };
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.14em",
        color: "#ff8c00",
        border: "1px solid rgba(255,140,0,0.35)",
        padding: "1px 7px",
        marginTop: "6px",
        textTransform: "uppercase",
      }}
    >
      {plan.type ? (labels[plan.type] ?? plan.type) : (plan.query_type ?? "")}
      {plan.rows_returned != null ? ` · ${plan.rows_returned} ROWS` : ""}
    </span>
  );
}

// ── Typing indicator (three amber dots) ──────────────────────────────────────
function TypingIndicator() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "10px 14px",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            width: "5px",
            height: "5px",
            background: "#ff8c00",
            borderRadius: "50%",
            animation: `kb-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ── Single chat message bubble ────────────────────────────────────────────────
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: "12px",
      }}
    >
      {/* Role label */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          color: "#555555",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: "4px",
        }}
      >
        {isUser ? "YOU" : "AI COMPANION"}
      </span>

      {/* Bubble */}
      <div
        style={{
          maxWidth: "88%",
          background: isUser ? "#1a1a1a" : "#0d0d0d",
          border: isUser ? "1px solid #2a2a2a" : "1px solid #1c1c1c",
          padding: "10px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          lineHeight: 1.65,
          color: "#e8e8e8",
          letterSpacing: "0.02em",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {message.content}
        {message.isStreaming && (
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "12px",
              background: "#ff8c00",
              marginLeft: "2px",
              animation: "kb-blink 0.8s step-end infinite",
              verticalAlign: "middle",
            }}
          />
        )}
      </div>

      {/* Query plan badge for assistant messages */}
      {!isUser && message.queryPlan && !message.isStreaming && (
        <QueryBadge plan={message.queryPlan} />
      )}
    </div>
  );
}

// ── Status bar ────────────────────────────────────────────────────────────────
function StatusBar({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "5px 14px",
        background: "rgba(255, 140, 0, 0.06)",
        borderBottom: "1px solid rgba(255,140,0,0.12)",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "#ff8c00",
          flexShrink: 0,
          animation: "kb-pulse 1.2s ease-in-out infinite",
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          color: "#ff8c00",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {status}
      </span>
    </div>
  );
}

// ── Keyframe injection (once per page load) ───────────────────────────────────
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes kb-pulse {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1.1); }
    }
    @keyframes kb-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    .kb-scroll::-webkit-scrollbar { width: 4px; }
    .kb-scroll::-webkit-scrollbar-track { background: #000; }
    .kb-scroll::-webkit-scrollbar-thumb { background: #2a2a2a; }
    .kb-input-row input::placeholder { color: #333; }
  `;
  document.head.appendChild(style);
}

// ── Main AICompanion component ────────────────────────────────────────────────
export function AICompanion() {
  const { sendMessage, messages, isStreaming, currentStatus, clearSession } =
    useKnowledgeBase();
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inject keyframe styles
  useEffect(() => {
    injectStyles();
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestion = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#080808",
        border: "1px solid #1c1c1c",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          borderBottom: "1px solid #1c1c1c",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: "#ff8c00",
              textTransform: "uppercase",
            }}
          >
            // AI COMPANION
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Status indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: isStreaming ? "#ff8c00" : "#00B050",
                flexShrink: 0,
                transition: "background 0.3s",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: isStreaming ? "#ff8c00" : "#555555",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {isStreaming ? "PROCESSING" : "IDLE"}
            </span>
          </div>

          {/* Clear session button */}
          {messages.length > 0 && (
            <button
              onClick={clearSession}
              title="Clear conversation"
              style={{
                background: "none",
                border: "1px solid #2a2a2a",
                color: "#555555",
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.1em",
                padding: "3px 8px",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "#ff3333";
                (e.currentTarget as HTMLButtonElement).style.color = "#ff3333";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "#2a2a2a";
                (e.currentTarget as HTMLButtonElement).style.color = "#555555";
              }}
            >
              CLEAR
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      <StatusBar status={currentStatus} />

      {/* Messages area */}
      <div
        className="kb-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {isEmpty ? (
          /* Suggested prompts when no messages */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              margin: "auto 0",
              paddingTop: "20px",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  letterSpacing: "0.18em",
                  color: "#555555",
                  textTransform: "uppercase",
                  marginBottom: "12px",
                }}
              >
                SUGGESTED QUERIES
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSuggestion(prompt)}
                    style={{
                      background: "#0d0d0d",
                      border: "1px solid #1c1c1c",
                      color: "#aaaaaa",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      letterSpacing: "0.03em",
                      padding: "9px 12px",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "border-color 0.1s, color 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "#ff8c00";
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "#f0f0f0";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "#1c1c1c";
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "#aaaaaa";
                    }}
                  >
                    <span style={{ color: "#ff8c00", marginRight: "8px" }}>
                      &gt;
                    </span>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {/* Show typing indicator when streaming but assistant content is still empty */}
            {isStreaming &&
              messages[messages.length - 1]?.role === "assistant" &&
              messages[messages.length - 1]?.content === "" && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    background: "#0d0d0d",
                    border: "1px solid #1c1c1c",
                    marginBottom: "12px",
                  }}
                >
                  <TypingIndicator />
                </div>
              )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input row */}
      <div
        style={{
          borderTop: "1px solid #1c1c1c",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          flexShrink: 0,
          background: "#080808",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "13px",
            color: inputFocused ? "#ff8c00" : "#555555",
            marginRight: "10px",
            userSelect: "none",
            flexShrink: 0,
            transition: "color 0.15s",
          }}
        >
          &gt;
        </span>
        <input
          ref={inputRef}
          className="kb-input-row"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          disabled={isStreaming}
          placeholder={isStreaming ? "processing..." : "ask anything about your job market..."}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#f0f0f0",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            letterSpacing: "0.02em",
            padding: "13px 0",
            opacity: isStreaming ? 0.5 : 1,
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isStreaming}
          title="Send"
          style={{
            background: "none",
            border: "none",
            color:
              input.trim() && !isStreaming ? "#ff8c00" : "#333333",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            cursor: input.trim() && !isStreaming ? "pointer" : "not-allowed",
            padding: "4px 0 4px 10px",
            letterSpacing: "0.05em",
            flexShrink: 0,
            transition: "color 0.15s",
          }}
        >
          ↵
        </button>
      </div>
    </div>
  );
}
