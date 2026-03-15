"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CaretLeft,
  Tag,
  CircleNotch,
  ArrowCounterClockwise,
  Wrench,
  Users,
} from "@phosphor-icons/react";
import { getAuthHeaders } from "@/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type KwGroup = { keywords: string[]; counts: Record<string, number> };

function dedup(raw: string[]): KwGroup {
  const counts: Record<string, number> = {};
  for (const kw of raw)
    counts[kw.toLowerCase()] = (counts[kw.toLowerCase()] || 0) + 1;
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const kw of raw) {
    const key = kw.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      keywords.push(kw);
    }
  }
  return { keywords, counts };
}

interface BadgeSectionProps {
  title: string;
  icon: React.ReactNode;
  group: KwGroup;
  checked: Set<string>;
  onToggle: (kw: string) => void;
  emptyLabel: string;
  accentColor: string;
}

function BadgeSection({
  title,
  icon,
  group,
  checked,
  onToggle,
  emptyLabel,
  accentColor,
}: BadgeSectionProps) {
  const [hoveredKw, setHoveredKw] = useState<string | null>(null);
  const addedCount = group.keywords.filter((kw) => checked.has(kw)).length;
  const totalCount = group.keywords.length;
  const pct = totalCount > 0 ? Math.round((addedCount / totalCount) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "20px",
              height: "20px",
              background: accentColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: accentColor,
              textTransform: "uppercase",
            }}
          >
            {"// "}{title.toUpperCase()}
          </span>
        </div>
        {totalCount > 0 && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              border: "1px solid #1c1c1c",
              padding: "2px 8px",
              color: pct >= 75 ? "#ffd700" : "#555555",
              letterSpacing: "0.08em",
            }}
          >
            {pct}% matched
          </div>
        )}
      </div>

      {group.keywords.length === 0 ? (
        <div
          style={{
            background: "#080808",
            border: "1px solid #1c1c1c",
            padding: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "#555555",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {emptyLabel}
          </span>
        </div>
      ) : (
        <div
          style={{
            background: "#080808",
            border: "1px solid #1c1c1c",
            padding: "12px",
            overflowY: "auto",
            maxHeight: "220px",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {group.keywords.map((kw) => {
              const isDone = checked.has(kw);
              const count = group.counts[kw.toLowerCase()] ?? 1;
              return (
                <div key={kw} style={{ position: "relative" }}>
                  {count > 1 && (
                    <span
                      style={{
                        position: "absolute",
                        top: "-6px",
                        right: "-6px",
                        zIndex: 10,
                        background: "#ff8c00",
                        color: "#000",
                        fontFamily: "var(--font-mono)",
                        fontSize: "8px",
                        fontWeight: 700,
                        padding: "1px 4px",
                        minWidth: "16px",
                        textAlign: "center",
                      }}
                    >
                      {count}
                    </span>
                  )}
                  <button
                    onClick={() => onToggle(kw)}
                    onMouseEnter={() => setHoveredKw(kw)}
                    onMouseLeave={() => setHoveredKw(null)}
                    style={{
                      border: isDone
                        ? "1px solid #1c1c1c"
                        : hoveredKw === kw
                        ? `1px solid ${accentColor}`
                        : "1px solid #333333",
                      background: isDone ? "#000000" : "#080808",
                      color: isDone
                        ? "#333333"
                        : hoveredKw === kw
                        ? accentColor
                        : "#f0f0f0",
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "4px 10px",
                      cursor: "pointer",
                      textDecoration: isDone ? "line-through" : "none",
                      opacity: isDone ? 0.45 : 1,
                      transition: "border-color 0.1s, color 0.1s",
                    }}
                  >
                    {kw}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function KeywordMatcher() {
  const [jobDescription, setJobDescription] = useState("");
  const [hardGroup, setHardGroup] = useState<KwGroup>({
    keywords: [],
    counts: {},
  });
  const [softGroup, setSoftGroup] = useState<KwGroup>({
    keywords: [],
    counts: {},
  });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backHovered, setBackHovered] = useState(false);
  const [resetHovered, setResetHovered] = useState(false);
  const [textareaFocused, setTextareaFocused] = useState(false);

  const hasResults =
    hardGroup.keywords.length > 0 || softGroup.keywords.length > 0;

  const handleAnalyze = async () => {
    if (!jobDescription.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/keywords/extract`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ job_description: jobDescription }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to extract keywords");
      }
      const data = await res.json();
      setHardGroup(dedup(data.hard_skills || []));
      setSoftGroup(dedup(data.soft_skills || []));
      setChecked(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const toggleKeyword = (kw: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  };

  const totalCount = hardGroup.keywords.length + softGroup.keywords.length;
  const addedCount = checked.size;
  const overallPct =
    totalCount > 0 ? Math.round((addedCount / totalCount) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#000000", color: "#f0f0f0" }}>
      <header
        style={{
          height: "44px",
          background: "#060606",
          borderBottom: "1px solid #1c1c1c",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/">
            <div
              onMouseEnter={() => setBackHovered(true)}
              onMouseLeave={() => setBackHovered(false)}
              style={{
                width: "28px",
                height: "28px",
                border: backHovered ? "1px solid #ff8c00" : "1px solid #1c1c1c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: backHovered ? "#ff8c00" : "#555555",
                cursor: "pointer",
                transition: "border-color 0.1s, color 0.1s",
              }}
            >
              <CaretLeft style={{ width: "14px", height: "14px" }} />
            </div>
          </Link>

          <div
            style={{
              width: "22px",
              height: "22px",
              background: "#ff8c00",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Tag
              weight="fill"
              style={{ width: "12px", height: "12px", color: "#000" }}
            />
          </div>

          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.2em",
                color: "#ff8c00",
                textTransform: "uppercase",
              }}
            >
              KEYWORD MATCHER
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.12em",
                color: "#555555",
                marginTop: "1px",
              }}
            >
              ATS KEYWORD EXTRACTOR
            </div>
          </div>
        </div>

        {hasResults && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.1em",
                border: "1px solid #1c1c1c",
                padding: "3px 10px",
                color: overallPct >= 75 ? "#ffd700" : "#ff8c00",
              }}
            >
              <span style={{ fontWeight: 700 }}>{overallPct}%</span>
              <span style={{ color: "#555555" }}> MATCHED</span>
            </div>
            {checked.size > 0 && (
              <button
                onClick={() => setChecked(new Set())}
                title="Reset all"
                onMouseEnter={() => setResetHovered(true)}
                onMouseLeave={() => setResetHovered(false)}
                style={{
                  width: "28px",
                  height: "28px",
                  border: resetHovered
                    ? "1px solid #ff8c00"
                    : "1px solid #1c1c1c",
                  background: "transparent",
                  color: resetHovered ? "#ff8c00" : "#555555",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "border-color 0.1s, color 0.1s",
                }}
              >
                <ArrowCounterClockwise style={{ width: "14px", height: "14px" }} />
              </button>
            )}
          </div>
        )}
      </header>

      <div style={{ minHeight: "calc(100vh - 44px)", background: "#000000" }}>
        <main
          className="grid grid-cols-1 md:grid-cols-2"
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            padding: "16px",
            gap: "16px",
          }}
        >
          {/* Left column — Job Description */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                fontWeight: 600,
                letterSpacing: "0.18em",
                color: "#ff8c00",
                textTransform: "uppercase",
                marginBottom: "10px",
              }}
            >
              {"// JOB DESCRIPTION"}
            </div>

            <textarea
              style={{
                background: "#080808",
                border: textareaFocused
                  ? "1px solid #ff8c00"
                  : "1px solid #1c1c1c",
                color: "#f0f0f0",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                padding: "12px",
                width: "100%",
                resize: "none",
                outline: "none",
                minHeight: "360px",
                lineHeight: 1.6,
                transition: "border-color 0.1s",
              }}
              placeholder="Paste job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              onFocus={() => setTextareaFocused(true)}
              onBlur={() => setTextareaFocused(false)}
              rows={20}
            />

            {error && (
              <div
                style={{
                  border: "1px solid rgba(255,51,51,0.4)",
                  background: "rgba(255,51,51,0.05)",
                  color: "#ff3333",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  padding: "8px 12px",
                  marginTop: "8px",
                }}
              >
                {error}
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={loading || !jobDescription.trim()}
              style={{
                border: "1px solid #ff8c00",
                background: "rgba(255,140,0,0.1)",
                color: "#ff8c00",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "10px",
                width: "100%",
                cursor:
                  loading || !jobDescription.trim() ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginTop: "12px",
                opacity: loading || !jobDescription.trim() ? 0.4 : 1,
              }}
            >
              {loading ? (
                <>
                  <CircleNotch
                    weight="bold"
                    style={{ width: "14px", height: "14px" }}
                    className="animate-spin"
                  />
                  ANALYZING...
                </>
              ) : (
                <>
                  <Tag weight="bold" style={{ width: "14px", height: "14px" }} />
                  ANALYZE
                </>
              )}
            </button>
          </div>

          {/* Right column — Results */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {!hasResults ? (
              <div
                style={{
                  background: "#080808",
                  border: "1px solid #1c1c1c",
                  padding: "48px 16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "28px",
                }}
              >
                <Tag
                  weight="duotone"
                  style={{ width: "32px", height: "32px", color: "#333333" }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    color: "#555555",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    textAlign: "center",
                    maxWidth: "280px",
                  }}
                >
                  {loading
                    ? "ANALYZING JOB DESCRIPTION..."
                    : "PASTE A JOB DESCRIPTION TO EXTRACT REQUIRED SKILLS"}
                </span>
              </div>
            ) : (
              <>
                <BadgeSection
                  title="Technical Skills"
                  icon={
                    <Wrench
                      weight="bold"
                      style={{ width: "11px", height: "11px", color: "#000" }}
                    />
                  }
                  group={hardGroup}
                  checked={checked}
                  onToggle={toggleKeyword}
                  emptyLabel="No technical skills found in this description"
                  accentColor="#ff8c00"
                />
                <BadgeSection
                  title="Professional Skills"
                  icon={
                    <Users
                      weight="bold"
                      style={{ width: "11px", height: "11px", color: "#000" }}
                    />
                  }
                  group={softGroup}
                  checked={checked}
                  onToggle={toggleKeyword}
                  emptyLabel="No professional skills found in this description"
                  accentColor="#00bfff"
                />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
