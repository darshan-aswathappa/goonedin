"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useKnowledgeBase } from "@/hooks/useKnowledgeBase";
import { ChatMessage, QueryPlan } from "@/types/knowledge-base";

// ── Suggested prompts shown when conversation is empty ────────────────────────
const SUGGESTED_PROMPTS = [
  "What companies are hiring the most?",
  "Show me remote Python jobs posted today",
  "What's the salary range for ML engineers?",
  "Which job sources are most active?",
];

// ── Lightweight inline markdown renderer ─────────────────────────────────────
// Handles: **bold**, *italic*, `code`, and newlines.
// Returns an array of React nodes suitable for inline rendering.
function renderMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split by markdown patterns: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Push text before the match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      nodes.push(
        <strong key={key++} style={{ color: "#ffffff", fontWeight: 700 }}>
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      nodes.push(
        <em key={key++} style={{ fontStyle: "italic" }}>
          {match[3]}
        </em>
      );
    } else if (match[4]) {
      // `code`
      nodes.push(
        <code
          key={key++}
          style={{
            background: "rgba(255,140,0,0.1)",
            border: "1px solid rgba(255,140,0,0.2)",
            padding: "1px 4px",
            fontSize: "11px",
            color: "#ff8c00",
          }}
        >
          {match[4]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

// ── Collapsible "Thinking" block (shows SQL + timing) ────────────────────────
function ThinkingBlock({ plan }: { plan: QueryPlan }) {
  const [open, setOpen] = useState(false);

  const queryType = plan.type || plan.query_type || "unknown";
  const hasSql = !!plan.sql_query;
  if (!hasSql && queryType !== "sql" && queryType !== "hybrid") return null;

  const elapsedLabel = plan.elapsed_ms != null ? `${(plan.elapsed_ms / 1000).toFixed(1)}s` : null;
  const sqlTimeLabel = plan.sql_time_ms != null ? `${plan.sql_time_ms}ms` : null;

  return (
    <div
      style={{
        marginTop: "6px",
        maxWidth: "88%",
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: "none",
          border: "1px solid rgba(255,140,0,0.2)",
          padding: "3px 8px",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#ff8c00",
          transition: "border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "rgba(255,140,0,0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(255,140,0,0.2)";
        }}
      >
        {/* Chevron */}
        <span
          style={{
            display: "inline-block",
            transition: "transform 0.15s",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            fontSize: "8px",
          }}
        >
          {"\u25B6"}
        </span>
        <span>
          {queryType === "hybrid" ? "SQL + VECTOR" : queryType.toUpperCase()}
        </span>
        {plan.rows_returned != null && (
          <span style={{ color: "#888" }}>{plan.rows_returned} rows</span>
        )}
        {elapsedLabel && (
          <span style={{ color: "#888" }}>{elapsedLabel}</span>
        )}
      </button>

      {/* Collapsible content */}
      {open && (
        <div
          style={{
            marginTop: "4px",
            border: "1px solid rgba(255,140,0,0.12)",
            background: "#0a0a0a",
            padding: "10px 12px",
            overflow: "auto",
          }}
        >
          {/* Timing breakdown */}
          {(sqlTimeLabel || elapsedLabel) && (
            <div
              style={{
                display: "flex",
                gap: "16px",
                marginBottom: hasSql ? "8px" : 0,
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.1em",
                color: "#888",
              }}
            >
              {sqlTimeLabel && (
                <span>
                  SQL EXEC: <span style={{ color: "#ff8c00" }}>{sqlTimeLabel}</span>
                </span>
              )}
              {elapsedLabel && (
                <span>
                  TOTAL: <span style={{ color: "#ff8c00" }}>{elapsedLabel}</span>
                </span>
              )}
            </div>
          )}

          {/* SQL query */}
          {hasSql && (
            <pre
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                lineHeight: 1.5,
                color: "#ccc",
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {plan.sql_query}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Query plan badge ──────────────────────────────────────────────────────────
function QueryBadge({ plan }: { plan: QueryPlan }) {
  const labels: Record<string, string> = {
    sql: "SQL",
    vector: "VECTOR",
    hybrid: "HYBRID",
    none: "NONE",
  };
  const queryType = plan.type || plan.query_type;
  // Don't render the simple badge if we show the thinking block instead
  if (queryType === "sql" || queryType === "hybrid") return null;

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
      {plan.rows_returned != null ? ` \u00b7 ${plan.rows_returned} ROWS` : ""}
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
  const renderedContent = useMemo(
    () => (isUser ? message.content : renderMarkdown(message.content)),
    [message.content, isUser]
  );

  const queryType = message.queryPlan?.type || message.queryPlan?.query_type;
  const showThinking = !isUser && message.queryPlan && !message.isStreaming &&
    (queryType === "sql" || queryType === "hybrid");

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
        {renderedContent}
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

      {/* Collapsible thinking block for SQL/hybrid queries */}
      {showThinking && <ThinkingBlock plan={message.queryPlan!} />}

      {/* Simple badge for vector/other queries */}
      {!isUser && message.queryPlan && !message.isStreaming && !showThinking && (
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
export function AICompanion({ onClose }: { onClose?: () => void }) {
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

  // Auto-focus input on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

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
    if (e.key === "Escape" && onClose) {
      onClose();
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
          height: "36px",
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
              fontSize: "9px",
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
                padding: "2px 6px",
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

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              title="Close AI Companion"
              style={{
                background: "none",
                border: "1px solid #2a2a2a",
                color: "#555555",
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.1em",
                padding: "2px 6px",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "#ff8c00";
                (e.currentTarget as HTMLButtonElement).style.color = "#ff8c00";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "#2a2a2a";
                (e.currentTarget as HTMLButtonElement).style.color = "#555555";
              }}
            >
              ESC
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
          {"\u21b5"}
        </button>
      </div>
    </div>
  );
}
