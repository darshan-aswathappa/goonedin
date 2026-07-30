"use client";

import { useEffect, useRef, useState } from "react";
import { useKnowledgeBase } from "@/hooks/useKnowledgeBase";
import { ChatMessage, QueryPlan } from "@/types/knowledge-base";
import { Chip, DsButton, Kicker } from "@/components/ds";

// ── Suggested prompts shown when conversation is empty ────────────────────────
const SUGGESTED_PROMPTS = [
  "What companies are hiring the most?",
  "Show me remote Python jobs posted today",
  "What's the salary range for ML engineers?",
  "Which job sources are most active?",
];

// ── Query plan badge ──────────────────────────────────────────────────────────
function QueryBadge({ plan }: { plan: QueryPlan }) {
  const labels: Record<string, string> = {
    sql: "SQL",
    vector: "VECTOR",
    hybrid: "HYBRID",
    none: "NONE",
  };
  return (
    <Chip
      tone="sunk"
      className="mt-1.5 px-2 py-1 text-[11px] uppercase tracking-[0.09em]"
    >
      {plan.type ? (labels[plan.type] ?? plan.type) : (plan.query_type ?? "")}
      {plan.rows_returned != null ? ` · ${plan.rows_returned} ROWS` : ""}
    </Chip>
  );
}

// ── Typing indicator (three brick dots) ──────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3.5 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block size-1.5 rounded-full bg-brick animate-live-pulse"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

// ── Single chat message ───────────────────────────────────────────────────────
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`mb-4 flex flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      {/* Role label */}
      <Kicker className="mb-1.5">{isUser ? "YOU" : "AI COMPANION"}</Kicker>

      {/* Message body — sharp corners, editorial rather than chat-bubble */}
      <div
        className={`max-w-[88%] whitespace-pre-wrap break-words rounded-[4px] px-3.5 py-3 font-sans text-[15px] leading-relaxed text-ink-2 ${
          isUser
            ? "border border-transparent bg-paper-sunk"
            : "border border-hairline bg-paper-card"
        }`}
      >
        {message.content}
        {message.isStreaming && (
          <span className="ml-0.5 inline-block h-3 w-2 align-middle bg-brick animate-cursor-blink" />
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
    <div className="flex items-center gap-2 border-b border-hairline bg-brick-tint px-3.5 py-1.5">
      <span className="size-1.5 shrink-0 rounded-full bg-brick animate-live-pulse" />
      <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-brick">
        {status}
      </span>
    </div>
  );
}

// ── Main AICompanion component ────────────────────────────────────────────────
export function AICompanion() {
  const { sendMessage, messages, isStreaming, currentStatus, clearSession } =
    useKnowledgeBase();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className="flex h-full flex-col rounded-[4px] border border-hairline bg-paper-card">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3.5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
          AI Companion
        </h2>

        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className="flex items-center gap-[7px]">
            <span
              className={`size-1.5 shrink-0 rounded-full transition-colors duration-300 ${
                isStreaming ? "bg-brick animate-live-pulse" : "bg-forest"
              }`}
            />
            <span
              className={`font-mono text-[11px] uppercase tracking-[0.09em] ${
                isStreaming ? "text-brick" : "text-ink-muted"
              }`}
            >
              {isStreaming ? "PROCESSING" : "IDLE"}
            </span>
          </div>

          {/* Clear session button */}
          {messages.length > 0 && (
            <DsButton
              variant="ghost"
              size="sm"
              onClick={clearSession}
              title="Clear conversation"
              className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted hover:bg-brick-tint hover:text-brick"
            >
              Clear
            </DsButton>
          )}
        </div>
      </div>

      {/* Status bar */}
      <StatusBar status={currentStatus} />

      {/* Messages area */}
      <div className="flex flex-1 flex-col overflow-y-auto px-3.5 py-4">
        {isEmpty ? (
          /* Suggested prompts when no messages */
          <div className="my-auto flex flex-col gap-5 pt-5">
            <div>
              <Kicker className="mb-3">SUGGESTED QUERIES</Kicker>
              <div className="flex flex-col gap-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSuggestion(prompt)}
                    className="rounded-[4px] border border-hairline bg-paper-sunk px-3 py-2.5 text-left font-sans text-[15px] text-ink-2 transition-colors duration-[120ms] hover:border-brick hover:text-ink"
                  >
                    <span className="mr-2 font-mono text-brick">&gt;</span>
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
                <div className="mb-4 self-start rounded-[4px] border border-hairline bg-paper-card">
                  <TypingIndicator />
                </div>
              )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input row */}
      <div className="group flex shrink-0 items-center border-t border-hairline bg-paper-card px-3.5">
        <span className="mr-2.5 shrink-0 select-none font-mono text-[15px] text-ink-muted transition-colors duration-[150ms] group-focus-within:text-brick">
          &gt;
        </span>
        <input
          ref={inputRef}
          aria-label="Ask the AI companion"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          placeholder={isStreaming ? "processing..." : "ask anything about your job market..."}
          className="flex-1 border-none bg-transparent py-3.5 font-mono text-[13px] text-ink outline-none placeholder:text-ink-faint disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isStreaming}
          title="Send"
          aria-label="Send"
          className="shrink-0 border-none bg-transparent py-1 pl-2.5 font-mono text-[15px] text-brick transition-colors duration-[150ms] disabled:cursor-not-allowed disabled:text-ink-faint"
        >
          ↵
        </button>
      </div>
    </div>
  );
}
