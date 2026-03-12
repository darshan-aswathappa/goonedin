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
  accentClass: string;
}

function BadgeSection({
  title,
  icon,
  group,
  checked,
  onToggle,
  emptyLabel,
  accentClass,
}: BadgeSectionProps) {
  const addedCount = group.keywords.filter((kw) => checked.has(kw)).length;
  const totalCount = group.keywords.length;
  const pct = totalCount > 0 ? Math.round((addedCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`brutal-border p-1 ${accentClass}`}>{icon}</span>
          <h3 className="font-black uppercase italic tracking-tighter">
            {title}
          </h3>
        </div>
        {totalCount > 0 && (
          <div
            className={`brutal-border px-2.5 py-0.5 text-xs font-black shadow-[2px_2px_0px_0px_var(--border)] ${pct >= 75 ? "bg-green-100 dark:bg-green-950" : "bg-card"}`}
          >
            <span
              className={
                pct >= 75
                  ? "text-green-600 dark:text-green-400"
                  : "text-primary"
              }
            >
              {pct}%
            </span>
            <span className="text-muted-foreground"> matched</span>
          </div>
        )}
      </div>

      {group.keywords.length === 0 ? (
        <div className="brutal-border bg-card p-4 flex items-center justify-center text-muted-foreground min-h-[100px]">
          <p className="font-black uppercase italic tracking-tighter text-xs">
            {emptyLabel}
          </p>
        </div>
      ) : (
        <div className="brutal-border bg-card p-3 overflow-y-auto max-h-[220px]">
          <div className="flex flex-wrap gap-2">
            {group.keywords.map((kw) => {
              const isDone = checked.has(kw);
              const count = group.counts[kw.toLowerCase()] ?? 1;
              return (
                <div key={kw} className="relative">
                  {count > 1 && (
                    <span className="absolute -top-1.5 -right-1.5 z-10 brutal-border bg-primary text-white text-[10px] font-black leading-none px-1 py-0.5 min-w-[18px] text-center">
                      {count}
                    </span>
                  )}
                  <button
                    onClick={() => onToggle(kw)}
                    className={`brutal-border px-3 py-1.5 text-sm font-bold transition-all shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                      isDone
                        ? "bg-muted text-muted-foreground line-through opacity-60"
                        : "bg-card hover:bg-muted"
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
    <div className="min-h-screen bg-background text-foreground font-medium transition-colors duration-300">
      <header className="brutal-border border-t-0 border-l-0 border-r-0 bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/">
                <div className="brutal-border p-2 bg-card hover:bg-muted transition-colors shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none h-[42px] w-[42px] flex items-center justify-center">
                  <CaretLeft weight="bold" className="h-5 w-5" />
                </div>
              </Link>
              <div className="brutal-border bg-primary p-2 shadow-[2px_2px_0px_0px_var(--border)]">
                <Tag weight="fill" className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter leading-none">
                  Keyword Matcher
                </h1>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  ATS Keyword Extractor
                </p>
              </div>
            </div>

            {hasResults && (
              <div className="flex items-center gap-2">
                <div
                  className={`brutal-border px-3 py-1.5 text-sm font-black shadow-[2px_2px_0px_0px_var(--border)] ${overallPct >= 75 ? "bg-green-100 dark:bg-green-950" : "bg-card"}`}
                >
                  <span
                    className={
                      overallPct >= 75
                        ? "text-green-600 dark:text-green-400"
                        : "text-primary"
                    }
                  >
                    {overallPct}%
                  </span>
                  <span className="text-muted-foreground"> overall</span>
                </div>
                {checked.size > 0 && (
                  <button
                    onClick={() => setChecked(new Set())}
                    className="brutal-border p-2 bg-card hover:bg-muted transition-colors shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none h-[42px] w-[42px] flex items-center justify-center"
                    title="Reset all"
                  >
                    <ArrowCounterClockwise weight="bold" className="h-5 w-5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column — input */}
          <div className="flex flex-col gap-4">
            <h2 className="font-black uppercase italic tracking-tighter text-lg">
              Job Description
            </h2>
            <textarea
              className="brutal-border bg-card p-3 font-mono text-sm resize-none w-full focus:outline-none focus:ring-0 min-h-[360px]"
              placeholder="Paste job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={20}
            />
            {error && (
              <p className="brutal-border border-red-500 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 px-3 py-2 text-sm font-bold">
                {error}
              </p>
            )}
            <button
              onClick={handleAnalyze}
              disabled={loading || !jobDescription.trim()}
              className="brutal-border px-4 py-3 font-black uppercase italic tracking-tighter bg-primary text-white hover:bg-black dark:hover:bg-white dark:hover:text-black transition-colors shadow-[4px_4px_0px_0px_var(--border)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <CircleNotch weight="bold" className="h-5 w-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Tag weight="bold" className="h-5 w-5" />
                  Analyze
                </>
              )}
            </button>
          </div>

          {/* Right column — two rows */}
          <div className="flex flex-col gap-6">
            {!hasResults ? (
              <div className="brutal-border bg-card p-8 mt-11 flex flex-col items-center justify-center gap-3 text-muted-foreground min-h-[90]">
                <Tag weight="duotone" className="h-12 w-12 opacity-30" />
                <p className="font-black uppercase italic tracking-tighter text-sm">
                  {loading
                    ? "Extracting keywords..."
                    : "Paste a job description and click Analyze"}
                </p>
              </div>
            ) : (
              <>
                <BadgeSection
                  title="Hard Skills"
                  icon={<Wrench weight="bold" className="h-4 w-4 text-white" />}
                  group={hardGroup}
                  checked={checked}
                  onToggle={toggleKeyword}
                  emptyLabel="No hard skills found"
                  accentClass="bg-primary"
                />
                <BadgeSection
                  title="Soft Skills"
                  icon={<Users weight="bold" className="h-4 w-4 text-white" />}
                  group={softGroup}
                  checked={checked}
                  onToggle={toggleKeyword}
                  emptyLabel="No soft skills found"
                  accentClass="bg-[#7c3aed]"
                />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
