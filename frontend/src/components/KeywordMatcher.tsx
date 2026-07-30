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
import { DsButton, Kicker, TextField } from "@/components/ds";

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
}

function BadgeSection({
  title,
  icon,
  group,
  checked,
  onToggle,
  emptyLabel,
}: BadgeSectionProps) {
  const addedCount = group.keywords.filter((kw) => checked.has(kw)).length;
  const totalCount = group.keywords.length;
  const pct = totalCount > 0 ? Math.round((addedCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Kicker className="flex items-center gap-2">
          {icon}
          {title.toUpperCase()}
        </Kicker>
        {totalCount > 0 && (
          <div className="flex items-baseline gap-1.5">
            <span
              className={`font-serif text-[17px] font-semibold tabular-nums leading-none ${
                pct >= 75 ? "text-forest" : "text-ink-2"
              }`}
            >
              {pct}%
            </span>
            <Kicker>matched</Kicker>
          </div>
        )}
      </div>

      {group.keywords.length === 0 ? (
        <div className="flex items-center justify-center rounded-[4px] border border-hairline bg-paper-sunk p-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
            {emptyLabel}
          </span>
        </div>
      ) : (
        <div className="max-h-[220px] overflow-y-auto rounded-[4px] border border-hairline bg-paper-sunk p-3">
          <div className="flex flex-wrap gap-2">
            {group.keywords.map((kw) => {
              const isDone = checked.has(kw);
              const count = group.counts[kw.toLowerCase()] ?? 1;
              return (
                <div key={kw} className="relative">
                  {count > 1 && (
                    <span className="absolute -right-1.5 -top-1.5 z-10 min-w-4 rounded-[4px] bg-brick px-1 py-px text-center font-mono text-[10px] leading-tight text-paper-card">
                      {count}
                    </span>
                  )}
                  <button
                    onClick={() => onToggle(kw)}
                    aria-pressed={isDone}
                    className={`rounded-[4px] border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.09em] transition-colors duration-[120ms] ${
                      isDone
                        ? "border-hairline bg-paper-sunk text-ink-faint line-through"
                        : "border-hairline-strong bg-paper-card text-ink-2 hover:border-brick hover:text-brick"
                    }`}
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
    <div className="min-h-dvh bg-paper text-ink">
      <header className="shell-header bg-paper-card">
        <div className="shell-header-inner">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              aria-label="Back to jobs"
              className="shell-back"
            >
              <CaretLeft className="size-4" />
            </Link>

            <div className="min-w-0">
              <h1 className="truncate font-serif text-[19px] font-semibold leading-none text-ink">
                Keyword Matcher
              </h1>
              <Kicker className="mt-1">ATS keyword extractor</Kicker>
            </div>
          </div>

          {hasResults && (
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`font-serif text-[22px] font-semibold tabular-nums leading-none ${
                    overallPct >= 75 ? "text-forest" : "text-brick"
                  }`}
                >
                  {overallPct}%
                </span>
                <Kicker>Matched</Kicker>
              </div>
              {checked.size > 0 && (
                <DsButton
                  variant="secondary"
                  size="icon-sm"
                  onClick={() => setChecked(new Set())}
                  title="Reset all"
                  aria-label="Reset all"
                  className="text-ink-muted hover:border-brick hover:text-brick"
                >
                  <ArrowCounterClockwise className="size-4" />
                </DsButton>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="bg-paper">
        <main className="shell-main mx-auto grid max-w-[1100px] grid-cols-1 gap-6 md:grid-cols-2">
          {/* Left column — Job Description */}
          <div className="flex flex-col">
            <TextField
              multiline
              label="JOB DESCRIPTION"
              placeholder="Paste job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={20}
              className="min-h-[360px] resize-none bg-paper-sunk text-[13px] leading-relaxed"
            />

            {error && (
              <div className="mt-2 rounded-[4px] border border-brick bg-brick-tint px-3 py-2 font-sans text-[13px] text-brick">
                {error}
              </div>
            )}

            <DsButton
              variant="primary"
              onClick={handleAnalyze}
              disabled={loading || !jobDescription.trim()}
              className="mt-3 w-full"
            >
              {loading ? (
                <>
                  <CircleNotch className="size-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Tag className="size-4" />
                  Analyze
                </>
              )}
            </DsButton>
          </div>

          {/* Right column — Results */}
          <div className="flex flex-col gap-8">
            {!hasResults ? (
              <div className="mt-7 flex flex-col items-center gap-3 rounded-[4px] border border-hairline bg-paper-sunk px-4 py-12">
                <Tag className="size-8 text-ink-faint" />
                <span className="max-w-[280px] text-center font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
                  {loading
                    ? "ANALYZING JOB DESCRIPTION..."
                    : "PASTE A JOB DESCRIPTION TO EXTRACT REQUIRED SKILLS"}
                </span>
              </div>
            ) : (
              <>
                <BadgeSection
                  title="Technical Skills"
                  icon={<Wrench className="size-3.5 text-ink-muted" />}
                  group={hardGroup}
                  checked={checked}
                  onToggle={toggleKeyword}
                  emptyLabel="No technical skills found in this description"
                />
                <BadgeSection
                  title="Professional Skills"
                  icon={<Users className="size-3.5 text-ink-muted" />}
                  group={softGroup}
                  checked={checked}
                  onToggle={toggleKeyword}
                  emptyLabel="No professional skills found in this description"
                />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
