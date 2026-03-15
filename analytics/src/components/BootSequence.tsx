"use client";

import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "goonedin-boot-seen";

const BOOT_LINES = [
  { text: "GOONEDIN ANALYTICS v2.0", delay: 0, color: "var(--teal)" },
  { text: "Initializing market intelligence terminal...", delay: 200, color: "var(--muted)" },
  { text: "", delay: 400, color: "" },
  { text: "[OK] Connected to job pipeline", delay: 500, color: "var(--green)" },
  { text: "[OK] DeepSeek AI analysis engine online", delay: 700, color: "var(--green)" },
  { text: "[OK] Supabase datastore active", delay: 900, color: "var(--green)" },
  { text: "", delay: 1100, color: "" },
  { text: "SYSTEM BRIEF", delay: 1200, color: "var(--teal)" },
  { text: "This terminal aggregates and analyzes job postings", delay: 1400, color: "var(--text-dim)" },
  { text: "scraped from LinkedIn, GitHub, MathWorks, and custom", delay: 1550, color: "var(--text-dim)" },
  { text: "ATS sources. Every listing is AI-analyzed for skills,", delay: 1700, color: "var(--text-dim)" },
  { text: "salary, seniority, visa sponsorship, and more.", delay: 1850, color: "var(--text-dim)" },
  { text: "", delay: 2000, color: "" },
  { text: "DASHBOARD LAYOUT", delay: 2100, color: "var(--teal)" },
  { text: "Row 1  KPI cards \u2014 total jobs, analysis rate, velocity", delay: 2300, color: "var(--text-dim)" },
  { text: "Row 2  Job volume trend \u2014 7/14/30/90-day timeline", delay: 2450, color: "var(--text-dim)" },
  { text: "Row 3  Top employers + geographic distribution", delay: 2600, color: "var(--text-dim)" },
  { text: "Row 4  Technical skills + posting heatmap", delay: 2750, color: "var(--text-dim)" },
  { text: "Row 5  Soft skills + skill co-occurrence matrix", delay: 2900, color: "var(--text-dim)" },
  { text: "Row 6  Seniority levels + posting day/time patterns", delay: 3050, color: "var(--text-dim)" },
  { text: "Row 7  Visa sponsorship + job functions", delay: 3200, color: "var(--text-dim)" },
  { text: "Row 8  Salary ranges + title keyword cloud", delay: 3350, color: "var(--text-dim)" },
  { text: "Row 9  Queue health + market intelligence summary", delay: 3500, color: "var(--text-dim)" },
  { text: "", delay: 3650, color: "" },
  { text: "Data auto-refreshes every 60 seconds.", delay: 3750, color: "var(--muted)" },
  { text: "Hover over any chart for detailed tooltips.", delay: 3900, color: "var(--muted)" },
  { text: "", delay: 4050, color: "" },
  { text: "Ready. Press any key or click to enter.", delay: 4200, color: "var(--teal)" },
];

export default function BootSequence() {
  const [visible, setVisible] = useState(false);
  const [visibleLines, setVisibleLines] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    BOOT_LINES.forEach((line, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleLines(i + 1);
        }, line.delay)
      );
    });

    const cursorInterval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 530);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(cursorInterval);
    };
  }, [visible]);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handler = () => {
      if (visibleLines >= BOOT_LINES.length) {
        dismiss();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, visibleLines, dismiss]);

  if (!visible) return null;

  const allRevealed = visibleLines >= BOOT_LINES.length;

  return (
    <div
      onClick={allRevealed ? dismiss : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "var(--bg-root)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        cursor: allRevealed ? "pointer" : "default",
      }}
    >
      <div
        style={{
          maxWidth: "560px",
          width: "100%",
          padding: "32px 24px",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          lineHeight: 1.8,
        }}
      >
        {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            style={{
              color: line.color || "transparent",
              minHeight: line.text === "" ? "11px" : undefined,
              letterSpacing: "0.04em",
              opacity: 0,
              animation: "boot-line-in 0.15s ease-out forwards",
            }}
          >
            {line.text}
          </div>
        ))}

        <span
          style={{
            display: "inline-block",
            width: "7px",
            height: "13px",
            background: allRevealed ? "var(--teal)" : "var(--muted)",
            opacity: cursorVisible ? 1 : 0,
            marginTop: "4px",
            verticalAlign: "bottom",
          }}
        />
      </div>

      {!allRevealed && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="ghost-btn"
          style={{ position: "absolute", bottom: "32px", right: "32px" }}
        >
          SKIP INTRO
        </button>
      )}
    </div>
  );
}
