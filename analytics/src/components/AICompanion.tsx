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

// ── Inline markdown: **bold**, *italic*, `code` ───────────────────────────────
function renderInline(text: string, keyOffset = 0): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = keyOffset;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2]) {
      nodes.push(<strong key={key++} style={{ color: "var(--text)", fontWeight: 700 }}>{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(<em key={key++} style={{ fontStyle: "italic" }}>{match[3]}</em>);
    } else if (match[4]) {
      nodes.push(
        <code key={key++} style={{ background: "var(--teal-dim)", border: "1px solid rgba(255,140,0,0.2)", padding: "1px 4px", fontSize: "11px", color: "var(--teal)" }}>
          {match[4]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// ── Block markdown: tables, bullet lists, regular lines ──────────────────────
function parseTableRow(line: string): string[] {
  return line.split("|").map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(c => /^[-: ]+$/.test(c));
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let bk = 0; // block key

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // ── Markdown table ──
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.map(parseTableRow);
      const sepIdx = rows.findIndex(isSeparatorRow);
      const header = rows[0];
      const body = sepIdx >= 0 ? rows.slice(sepIdx + 1) : rows.slice(1);
      blocks.push(
        <div key={bk++} style={{ overflowX: "auto", margin: "6px 0" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "11px", whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                {header.map((cell, j) => (
                  <th key={j} style={{ textAlign: "left", padding: "4px 12px 4px 0", borderBottom: "1px solid var(--teal-glow)", color: "var(--teal)", fontWeight: 700, letterSpacing: "0.06em", paddingRight: "16px" }}>
                    {renderInline(cell, j * 1000)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: "5px 16px 5px 0", color: "var(--text)", verticalAlign: "top" }}>
                      {renderInline(cell, ri * 10000 + ci * 100)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // ── Bullet list ──
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={bk++} style={{ margin: "4px 0", padding: 0, listStyle: "none" }}>
          {items.map((item, j) => (
            <li key={j} style={{ display: "flex", gap: "6px", marginBottom: "3px", alignItems: "flex-start" }}>
              <span style={{ color: "var(--teal)", flexShrink: 0 }}>›</span>
              <span>{renderInline(item, j * 100)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Empty line → spacer ──
    if (trimmed === "") {
      blocks.push(<div key={bk++} style={{ height: "6px" }} />);
      i++;
      continue;
    }

    // ── Regular text line ──
    blocks.push(
      <div key={bk++}>{renderInline(lines[i])}</div>
    );
    i++;
  }

  return blocks;
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
          borderRadius: "var(--radius)",
          padding: "3px 8px",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--teal)",
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
          <span style={{ color: "var(--text-dim)" }}>{plan.rows_returned} rows</span>
        )}
        {elapsedLabel && (
          <span style={{ color: "var(--text-dim)" }}>{elapsedLabel}</span>
        )}
      </button>

      {/* Collapsible content */}
      {open && (
        <div
          style={{
            marginTop: "4px",
            border: "1px solid rgba(255,140,0,0.12)",
            background: "var(--bg-panel)",
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
                color: "var(--text-dim)",
              }}
            >
              {sqlTimeLabel && (
                <span>
                  SQL EXEC: <span style={{ color: "var(--teal)" }}>{sqlTimeLabel}</span>
                </span>
              )}
              {elapsedLabel && (
                <span>
                  TOTAL: <span style={{ color: "var(--teal)" }}>{elapsedLabel}</span>
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
                color: "var(--text-dim)",
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
    vector: "SEMANTIC",
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
        color: "var(--teal)",
        border: "1px solid var(--teal-glow)",
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
            background: "var(--teal)",
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
          color: "var(--muted)",
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
          background: isUser ? "var(--bg-panel-hover)" : "var(--bg-panel)",
          border: isUser ? "1px solid var(--border-bright)" : "1px solid var(--border)",
          padding: "10px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          lineHeight: 1.65,
          color: "var(--text)",
          letterSpacing: "0.02em",
          whiteSpace: isUser ? "pre-wrap" : "normal",
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
              background: "var(--teal)",
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
        background: "var(--teal-dim)",
        borderBottom: "1px solid var(--teal-dim)",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "var(--teal)",
          flexShrink: 0,
          animation: "kb-pulse 1.2s ease-in-out infinite",
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          color: "var(--teal)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {status}
      </span>
    </div>
  );
}

// ── Main AICompanion component ────────────────────────────────────────────────
// Note: kb-pulse, kb-blink, .kb-scroll, .kb-input-row styles live in globals.css
export function AICompanion({ onClose, isOpen }: { onClose?: () => void; isOpen?: boolean }) {
  const { sendMessage, messages, isStreaming, currentStatus, clearSession } =
    useKnowledgeBase();
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Auto-focus input when panel opens
  useEffect(() => {
    if (isOpen === false) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen]);

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
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
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
          borderBottom: "1px solid var(--border)",
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
              color: "var(--teal)",
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
                background: isStreaming ? "var(--teal)" : "var(--muted)",
                flexShrink: 0,
                transition: "background 0.3s",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: isStreaming ? "var(--teal)" : "var(--muted)",
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
                border: "1px solid var(--border-bright)",
                borderRadius: "var(--radius)",
                color: "var(--muted)",
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.1em",
                padding: "2px 6px",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--red)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--red)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--border-bright)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)";
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
                border: "1px solid var(--border-bright)",
                borderRadius: "var(--radius)",
                color: "var(--muted)",
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.1em",
                padding: "2px 6px",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--teal)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--teal)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--border-bright)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)";
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
        aria-live="polite"
        aria-label="Conversation"
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
                  color: "var(--muted)",
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
                    className="ai-suggestion-btn"
                    style={{
                      background: "var(--bg-panel)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--text-dim)",
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
                        "var(--teal)";
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "var(--border)";
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "var(--text-dim)";
                    }}
                  >
                    <span style={{ color: "var(--teal)", marginRight: "8px" }}>
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
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
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

      {/* Character limit warning */}
      {input.length > 1800 && (
        <div
          style={{
            padding: "2px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: "8px",
            color: input.length > 1950 ? "var(--red)" : "var(--muted)",
            letterSpacing: "0.08em",
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {2000 - input.length} CHARS LEFT
        </div>
      )}

      {/* Input row */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          flexShrink: 0,
          background: "var(--bg-panel)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "13px",
            color: inputFocused ? "var(--teal)" : "var(--muted)",
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
          placeholder={isStreaming ? "processing..." : "query your job market data..."}
          maxLength={2000}
          aria-label="Ask a question about your job market"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text)",
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
              input.trim() && !isStreaming ? "var(--teal)" : "var(--border-bright)",
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
