"use client";

import { useState, useEffect } from "react";
import { Job, JobAnalysis } from "@/store/jobs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkle,
  ShieldCheck,
  Star,
  GraduationCap,
  WarningCircle,
  CircleNotch,
  X,
} from "@phosphor-icons/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { getAuthHeaders } from "@/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface JobAnalysisModalProps {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LOADING_MESSAGES = [
  "Parsing requirements...",
  "Extracting keywords...",
  "Calibrating match score...",
  "Analyzing role fit...",
];

export function JobAnalysisModal({ job, open, onOpenChange }: JobAnalysisModalProps) {
  const [fetchedAnalysis, setFetchedAnalysis] = useState<JobAnalysis | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [msgIdx, setMsgIdx] = useState(0);

  const analysis: JobAnalysis | null = job.analysis || fetchedAnalysis;

  useEffect(() => {
    if (fetchStatus !== "loading") return;
    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (!open) return;
    if (job.analysis) return;
    if (fetchStatus !== "idle") return;

    const doFetch = async () => {
      setFetchStatus("loading");
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(
          `${API_URL}/jobs/${job.external_id}/analysis`,
          { headers }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.status === "completed" && data.analysis) {
            setFetchedAnalysis({
              must_have_keywords: data.analysis.must_have_keywords || [],
              good_to_have_keywords: data.analysis.good_to_have_keywords || [],
              minimum_qualifications: data.analysis.minimum_qualifications || [],
              summary: data.analysis.summary || "",
            });
            setFetchStatus("done");
          } else {
            setFetchStatus("failed");
          }
        } else {
          setFetchStatus("failed");
        }
      } catch {
        setFetchStatus("failed");
      }
    };
    doFetch();
  }, [open, job.analysis, job.external_id, fetchStatus]);

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen && fetchStatus === "failed") {
      setFetchStatus("idle");
      setFetchedAnalysis(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-2xl bg-card text-foreground border-2 border-border rounded-none shadow-[4px_4px_0px_0px_var(--border)] sm:shadow-[8px_8px_0px_0px_var(--border)] max-h-[90dvh] overflow-y-auto p-0 gap-0 focus:outline-none max-w-[calc(100%-1.5rem)] sm:max-w-2xl">
        <DialogHeader className="p-3 sm:p-6 bg-foreground text-background space-y-0.5 sm:space-y-1 relative">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-2xl font-black italic uppercase tracking-tighter pr-10">
            <Sparkle weight="fill" className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Analysis
          </DialogTitle>
          <p className="text-background/70 font-bold text-xs sm:text-sm line-clamp-2">
            {job.title} — {job.company}
          </p>

          <DialogPrimitive.Close className="absolute right-2 sm:right-4 top-3 sm:top-4 brutal-border bg-card p-1.5 sm:p-3 text-foreground hover:bg-primary hover:text-white transition-all shadow-[1px_1px_0px_0px_var(--border)] sm:shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none focus:outline-none">
            <X weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogHeader>

        <div className="p-3 sm:p-6 space-y-4 sm:space-y-8">
          {!analysis && fetchStatus === "loading" ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12">
              <CircleNotch weight="bold" className="h-8 w-8 sm:h-12 sm:w-12 animate-spin text-primary mb-2 sm:mb-4" />
              <h3 key={msgIdx} className="text-base sm:text-xl font-black uppercase italic tracking-tighter animate-msg-in">
                {LOADING_MESSAGES[msgIdx]}<span className="animate-cursor-blink">_</span>
              </h3>
            </div>
          ) : job.analysis_status === "unavailable" && !analysis ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-2 text-center">
              <WarningCircle weight="bold" className="h-8 w-8 sm:h-12 sm:w-12 text-amber-500 mb-2 sm:mb-4" />
              <h3 className="text-base sm:text-xl font-black uppercase italic">Couldn&apos;t Analyze</h3>
              <p className="font-bold text-muted-foreground mt-1 sm:mt-2 text-xs sm:text-sm max-w-sm">
                We couldn&apos;t analyze this job. Check the original posting for details.
              </p>
            </div>
          ) : analysis ? (
            <div className="space-y-4 sm:space-y-8">
              {analysis.summary && (
                <div className="brutal-border bg-card p-2.5 sm:p-6 shadow-[2px_2px_0px_0px_var(--border)] sm:shadow-[4px_4px_0px_0px_var(--border)] animate-tab-in" style={{ animationDelay: "0ms" }}>
                  <div className="mb-2 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-black uppercase tracking-widest text-muted-foreground">
                    <Sparkle weight="bold" className="h-3 w-3 sm:h-4 sm:w-4" />
                    Summary
                  </div>
                  <p className="text-xs sm:text-sm font-bold leading-relaxed">
                    {analysis.summary}
                  </p>
                </div>
              )}

              {analysis.must_have_keywords.length > 0 && (
                <div className="space-y-2 sm:space-y-4 animate-tab-in" style={{ animationDelay: "80ms" }}>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-lg font-black uppercase italic tracking-tighter">
                    <ShieldCheck weight="fill" className="h-5 w-5 sm:h-6 sm:w-6 text-destructive" />
                    Must-Have
                    <span className="brutal-border bg-destructive text-white px-1.5 sm:px-2 py-0.5 text-xs not-italic">
                      {analysis.must_have_keywords.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {analysis.must_have_keywords.map((kw, i) => (
                      <div
                        key={i}
                        className="brutal-border bg-card px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-black uppercase shadow-[1px_1px_0px_0px_var(--border)] hover:bg-primary hover:text-white transition-colors cursor-default animate-tab-in"
                        style={{ animationDelay: `${80 + i * 22}ms` }}
                      >
                        {kw}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.good_to_have_keywords.length > 0 && (
                <div className="space-y-2 sm:space-y-4 animate-tab-in" style={{ animationDelay: "160ms" }}>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-lg font-black uppercase italic tracking-tighter">
                    <Star weight="fill" className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-500" />
                    Nice-to-Have
                    <span className="brutal-border bg-green-600 text-white px-1.5 sm:px-2 py-0.5 text-xs not-italic">
                      {analysis.good_to_have_keywords.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {analysis.good_to_have_keywords.map((kw, i) => (
                      <div
                        key={i}
                        className="brutal-border bg-card px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-black uppercase shadow-[1px_1px_0px_0px_var(--border)] hover:bg-primary hover:text-white transition-colors cursor-default animate-tab-in"
                        style={{ animationDelay: `${240 + i * 22}ms` }}
                      >
                        {kw}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.minimum_qualifications.length > 0 && (
                <div className="space-y-2 sm:space-y-4 animate-tab-in" style={{ animationDelay: "240ms" }}>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-lg font-black uppercase italic tracking-tighter text-foreground">
                    <GraduationCap weight="fill" className="h-5 w-5 sm:h-6 sm:w-6" />
                    Education
                  </div>
                  <div className="space-y-1.5 sm:space-y-3">
                    {analysis.minimum_qualifications.map((qual, i) => (
                      <div
                        key={i}
                        className="brutal-border bg-card px-2.5 sm:px-4 py-1.5 sm:py-3 text-xs sm:text-sm font-bold shadow-[1px_1px_0px_0px_var(--border)] sm:shadow-[2px_2px_0px_0px_var(--border)]"
                      >
                        {qual}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-2 text-center">
              <WarningCircle weight="bold" className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground mb-2 sm:mb-4" />
              <h3 className="text-base sm:text-xl font-black uppercase italic">Analysis Queued</h3>
              <p className="font-bold text-muted-foreground text-xs sm:text-sm">This job is in the analysis queue. It will be ready shortly.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
