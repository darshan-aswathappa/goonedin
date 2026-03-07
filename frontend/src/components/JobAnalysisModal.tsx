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

export function JobAnalysisModal({ job, open, onOpenChange }: JobAnalysisModalProps) {
  const [fetchedAnalysis, setFetchedAnalysis] = useState<JobAnalysis | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "done" | "failed">("idle");

  const analysis: JobAnalysis | null = job.analysis || fetchedAnalysis;

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
      <DialogContent showCloseButton={false} className="max-w-2xl bg-card text-foreground border-2 border-border rounded-none shadow-[8px_8px_0px_0px_var(--border)] sm:max-h-[85vh] overflow-y-auto p-0 gap-0 focus:outline-none">
        <DialogHeader className="p-6 bg-foreground text-background space-y-1 relative">
          <DialogTitle className="flex items-center gap-2 text-2xl font-black italic uppercase tracking-tighter">
            <Sparkle weight="fill" className="h-6 w-6 text-primary" />
            Deep Analysis
          </DialogTitle>
          <p className="text-background/70 font-bold text-sm">
            {job.title} — {job.company}
          </p>
          
          <DialogPrimitive.Close className="absolute right-4 top-4 brutal-border bg-card p-2 text-foreground hover:bg-primary hover:text-white transition-all shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none focus:outline-none">
            <X weight="bold" className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogHeader>

        <div className="p-6 space-y-8">
          {/* Loading state */}
          {!analysis && fetchStatus === "loading" ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CircleNotch weight="bold" className="h-12 w-12 animate-spin text-[#F15152] mb-4" />
              <h3 className="text-xl font-black uppercase italic">Scanning...</h3>
            </div>
          ) : job.analysis_status === "unavailable" && !analysis ? (
            <div className="flex flex-col items-center justify-center py-12">
              <WarningCircle weight="bold" className="h-12 w-12 text-[#F0A500] mb-4" />
              <h3 className="text-xl font-black uppercase italic">Analysis Unavailable</h3>
              <p className="font-bold text-muted-foreground mt-2 text-center max-w-sm">
                The AI analysis could not be completed for this job after multiple attempts. You can still view the job posting directly.
              </p>
            </div>
          ) : analysis ? (
            <div className="space-y-8">
              {/* Summary */}
              {analysis.summary && (
                <div className="brutal-border bg-card p-6 shadow-[4px_4px_0px_0px_var(--border)]">
                  <div className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-muted-foreground">
                    <Sparkle weight="bold" className="h-4 w-4" />
                    Role Context
                  </div>
                  <p className="text-sm font-bold leading-relaxed">
                    {analysis.summary}
                  </p>
                </div>
              )}

              {/* Must Have Keywords */}
              {analysis.must_have_keywords.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-black uppercase italic tracking-tighter">
                    <ShieldCheck weight="fill" className="h-6 w-6 text-[#F15152]" />
                    Hard Requirements
                    <span className="brutal-border bg-[#F15152] text-white px-2 py-0.5 text-xs not-italic">
                      {analysis.must_have_keywords.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {analysis.must_have_keywords.map((kw, i) => (
                      <div
                        key={i}
                        className="brutal-border bg-card px-3 py-1 text-xs font-black uppercase hover:bg-primary hover:text-white transition-colors cursor-default"
                      >
                        {kw}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Good to Have Keywords */}
              {analysis.good_to_have_keywords.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-black uppercase italic tracking-tighter">
                    <Star weight="fill" className="h-6 w-6 text-[#009063]" />
                    Secondary Skills
                    <span className="brutal-border bg-[#009063] text-white px-2 py-0.5 text-xs not-italic">
                      {analysis.good_to_have_keywords.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {analysis.good_to_have_keywords.map((kw, i) => (
                      <div
                        key={i}
                        className="brutal-border bg-card px-3 py-1 text-xs font-black uppercase hover:bg-primary hover:text-white transition-colors cursor-default"
                      >
                        {kw}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Minimum Qualifications */}
              {analysis.minimum_qualifications.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-black uppercase italic tracking-tighter text-foreground">
                    <GraduationCap weight="fill" className="h-6 w-6" />
                    Credentials & Exp
                  </div>
                  <div className="space-y-3">
                    {analysis.minimum_qualifications.map((qual, i) => (
                      <div
                        key={i}
                        className="brutal-border bg-card px-4 py-3 text-sm font-bold shadow-[2px_2px_0px_0px_var(--border)]"
                      >
                        {qual}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <WarningCircle weight="bold" className="h-12 w-12 text-[#606060] mb-4" />
              <h3 className="text-xl font-black uppercase italic">No Data Found</h3>
              <p className="font-bold text-[#606060]">Analysis data is not yet available.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
