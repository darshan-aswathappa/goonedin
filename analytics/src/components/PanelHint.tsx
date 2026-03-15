"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Props {
  id: string;
  hint: string;
}

const STORAGE_PREFIX = "goonedin-hint-";

export default function PanelHint({ id, hint }: Props) {
  const [dismissed, setDismissed] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (!seen) setDismissed(false);
  }, [id]);

  const dismiss = useCallback(() => {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, "1");
    setDismissed(true);
    setShowTooltip(false);
  }, [id]);

  useEffect(() => {
    if (!showTooltip) return;
    const handler = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTooltip]);

  if (dismissed) return null;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={buttonRef}
        onClick={() => setShowTooltip((v) => !v)}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "8px",
          fontWeight: 700,
          width: "14px",
          height: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: showTooltip ? "var(--teal)" : "var(--teal-dim)",
          color: showTooltip ? "#000" : "var(--teal)",
          border: `1px solid ${showTooltip ? "var(--teal)" : "var(--border-bright)"}`,
          borderRadius: "var(--radius)",
          cursor: "pointer",
          transition: "all 0.15s",
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!showTooltip) {
            e.currentTarget.style.borderColor = "var(--teal)";
          }
        }}
        onMouseLeave={(e) => {
          if (!showTooltip) {
            e.currentTarget.style.borderColor = "var(--border-bright)";
          }
        }}
      >
        ?
      </button>

      {showTooltip && (
        <div
          ref={tooltipRef}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "0",
            zIndex: 200,
            background: "var(--bg-panel)",
            border: "1px solid var(--teal)",
            borderRadius: "var(--radius)",
            padding: "10px 12px",
            minWidth: "220px",
            maxWidth: "300px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            lineHeight: 1.6,
            color: "var(--text-dim)",
            letterSpacing: "0.02em",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.6)",
          }}
        >
          <div style={{ marginBottom: "8px" }}>{hint}</div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "8px",
              letterSpacing: "0.1em",
              color: "var(--muted)",
              background: "none",
              border: "1px solid var(--border)",
              padding: "3px 8px",
              borderRadius: "var(--radius)",
              cursor: "pointer",
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--teal)";
              e.currentTarget.style.borderColor = "var(--teal)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--muted)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            GOT IT
          </button>
        </div>
      )}
    </div>
  );
}
