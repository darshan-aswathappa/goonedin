"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretLeft, Tag, CircleNotch, ArrowCounterClockwise } from "@phosphor-icons/react";
import { getAuthHeaders } from "@/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function KeywordMatcher() {
  const [jobDescription, setJobDescription] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setKeywords(data.keywords || []);
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

  const addedCount = checked.size;
  const totalCount = keywords.length;

  return (
    <div className="min-h-screen bg-background text-foreground font-medium transition-colors duration-300">
      <header className="brutal-border border-t-0 border-l-0 border-r-0 bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3">
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

          {/* Right column — keywords */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-black uppercase italic tracking-tighter text-lg">
                Keywords
              </h2>
              <div className="flex items-center gap-2">
                {totalCount > 0 && (
                  <div className="brutal-border bg-card px-3 py-1 text-sm font-black shadow-[2px_2px_0px_0px_var(--border)]">
                    <span className="text-primary">{addedCount}</span>
                    <span className="text-muted-foreground"> / {totalCount} added</span>
                  </div>
                )}
                {checked.size > 0 && (
                  <button
                    onClick={() => setChecked(new Set())}
                    className="brutal-border p-1.5 bg-card hover:bg-muted transition-colors shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    title="Reset all"
                  >
                    <ArrowCounterClockwise weight="bold" className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {keywords.length === 0 ? (
              <div className="brutal-border bg-card p-8 flex flex-col items-center justify-center gap-3 text-muted-foreground min-h-[360px]">
                <Tag weight="duotone" className="h-12 w-12 opacity-30" />
                <p className="font-black uppercase italic tracking-tighter text-sm">
                  {loading ? "Extracting keywords..." : "Paste a job description and click Analyze"}
                </p>
              </div>
            ) : (
              <div className="brutal-border bg-card p-4 min-h-[360px] overflow-y-auto">
                <div className="flex flex-wrap gap-2">
                  {keywords.map((kw) => {
                    const isDone = checked.has(kw);
                    return (
                      <button
                        key={kw}
                        onClick={() => toggleKeyword(kw)}
                        className={`brutal-border px-3 py-1.5 text-sm font-bold transition-all shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                          isDone
                            ? "bg-muted text-muted-foreground line-through opacity-60"
                            : "bg-card hover:bg-muted"
                        }`}
                      >
                        {kw}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
