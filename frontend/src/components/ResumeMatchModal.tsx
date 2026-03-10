"use client";

import { useState, useEffect } from "react";
import { Job, ResumeMatch } from "@/store/jobs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  CircleNotch,
  CheckCircle,
  XCircle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { getAuthHeaders } from "@/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ResumeMatchModalProps {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResumeMatchModal({ job, open, onOpenChange }: ResumeMatchModalProps) {
  const [fetchedResumeMatch, setFetchedResumeMatch] = useState<ResumeMatch | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "done" | "failed" | "none">("idle");

  const resumeMatch: ResumeMatch | null = job.resume_match || fetchedResumeMatch;

  useEffect(() => {
    if (!open) return;
    if (job.resume_match !== undefined) return;
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
          if (data.resume_match) {
            setFetchedResumeMatch(data.resume_match);
            setFetchStatus("done");
          } else {
            setFetchStatus("none");
          }
        } else {
          setFetchStatus("failed");
        }
      } catch {
        setFetchStatus("failed");
      }
    };
    doFetch();
  }, [open, job.resume_match, job.external_id, fetchStatus]);

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setFetchStatus("idle");
      setFetchedResumeMatch(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-xl bg-card text-foreground border-2 border-border rounded-none shadow-[8px_8px_0px_0px_var(--border)] max-h-[85vh] overflow-y-auto p-0 gap-0 focus:outline-none">
        <DialogHeader className="p-6 bg-foreground text-background space-y-1 relative">
          <DialogTitle className="flex items-center gap-2 text-2xl font-black italic uppercase tracking-tighter">
            <FileText weight="fill" className="h-6 w-6 text-[#7C3AED]" />
            Resume Match
          </DialogTitle>
          <p className="text-background/70 font-bold text-sm">
            {job.title} — {job.company}
          </p>

          <DialogPrimitive.Close className="absolute right-4 top-4 brutal-border bg-card p-3 text-foreground hover:bg-primary hover:text-white transition-all shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none focus:outline-none">
            <X weight="bold" className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogHeader>

        <div className="p-4 sm:p-6">
          {fetchStatus === "loading" && !resumeMatch ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CircleNotch weight="bold" className="h-12 w-12 animate-spin text-[#7C3AED] mb-4" />
              <h3 className="text-xl font-black uppercase italic">Matching...</h3>
            </div>
          ) : resumeMatch ? (
            <div className="space-y-4">
              <div className="brutal-border bg-card p-4 shadow-[4px_4px_0px_0px_var(--border)] space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase text-muted-foreground truncate flex-1 mr-4">
                    {resumeMatch.best_resume_filename}
                  </p>
                  <span className="brutal-border bg-[#7C3AED] text-white px-2 py-0.5 text-sm font-black shrink-0">
                    {Math.round(resumeMatch.score * 100)}%
                  </span>
                </div>
                <div className="w-full bg-muted h-3 brutal-border overflow-hidden">
                  <div
                    className="h-full bg-[#7C3AED] transition-all"
                    style={{ width: `${Math.round(resumeMatch.score * 100)}%` }}
                  />
                </div>

                {resumeMatch.matched_skills.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase text-muted-foreground">Matched</p>
                    <div className="flex flex-wrap gap-2">
                      {resumeMatch.matched_skills.map((skill, i) => (
                        <div key={i} className="flex items-center gap-1 brutal-border bg-card px-2 py-0.5 text-xs font-black uppercase text-[#009063]">
                          <CheckCircle weight="fill" className="h-3 w-3" />
                          {skill}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {resumeMatch.missing_skills.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase text-muted-foreground">Missing</p>
                    <div className="flex flex-wrap gap-2">
                      {resumeMatch.missing_skills.map((skill, i) => (
                        <div key={i} className="flex items-center gap-1 brutal-border bg-card px-2 py-0.5 text-xs font-black uppercase text-[#F15152]">
                          <XCircle weight="fill" className="h-3 w-3" />
                          {skill}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {resumeMatch.matched_nice_to_have.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase text-muted-foreground">Bonus Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {resumeMatch.matched_nice_to_have.map((skill, i) => (
                        <div key={i} className="flex items-center gap-1 brutal-border bg-card px-2 py-0.5 text-xs font-black uppercase text-muted-foreground">
                          <CheckCircle weight="fill" className="h-3 w-3" />
                          {skill}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <WarningCircle weight="bold" className="h-12 w-12 text-[#606060] mb-4" />
              <h3 className="text-xl font-black uppercase italic">No Match Data</h3>
              <p className="font-bold text-[#606060] text-center mt-2">
                Resume match is not yet available for this job.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
