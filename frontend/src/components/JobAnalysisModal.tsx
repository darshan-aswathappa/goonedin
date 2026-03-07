"use client";

import { useState, useEffect } from "react";
import { Job, JobAnalysis } from "@/store/jobs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Star,
  GraduationCap,
} from "lucide-react";
import { getAuthHeaders } from "@/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface JobAnalysisModalProps {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JobAnalysisModal({ job, open, onOpenChange }: JobAnalysisModalProps) {
  // Use embedded analysis if available, otherwise fetch from API
  const [fetchedAnalysis, setFetchedAnalysis] = useState<JobAnalysis | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "done" | "failed">("idle");

  const analysis: JobAnalysis | null = job.analysis || fetchedAnalysis;

  // Only fetch from API if job doesn't have embedded analysis
  useEffect(() => {
    if (!open) return;
    if (job.analysis) return; // Already embedded, no need to fetch
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
      // Reset so user can retry next time
      setFetchStatus("idle");
      setFetchedAnalysis(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl border-gray-800 bg-[#0d1117] text-white sm:max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-amber-400" />
            Job Analysis
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {job.title} — {job.company}
          </DialogDescription>
        </DialogHeader>

        {/* Loading state — only when fetching from API (no embedded analysis) */}
        {!analysis && fetchStatus === "loading" ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
              <div className="relative rounded-full bg-amber-500/10 p-4">
                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              </div>
            </div>
            <h3 className="mb-1 font-medium text-white">Loading Insights</h3>
            <p className="text-center text-sm text-gray-400 max-w-xs">
              Retrieving job analysis from the server...
            </p>
          </div>
        ) : analysis ? (
          <div className="space-y-6 py-2">
            {/* Summary */}
            {analysis.summary && (
              <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-400">
                  <Sparkles className="h-4 w-4" />
                  Role Summary
                </div>
                <p className="text-sm leading-relaxed text-gray-300">
                  {analysis.summary}
                </p>
              </div>
            )}

            {/* Must Have Keywords */}
            {analysis.must_have_keywords.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-200">
                  <ShieldCheck className="h-4 w-4 text-red-400" />
                  Must Have
                  <Badge
                    variant="outline"
                    className="ml-1 border-red-500/30 bg-red-500/10 text-red-300 text-xs px-1.5 py-0"
                  >
                    {analysis.must_have_keywords.length}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.must_have_keywords.map((kw, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="border-red-500/30 bg-red-500/10 text-red-300"
                    >
                      {kw}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Good to Have Keywords */}
            {analysis.good_to_have_keywords.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-200">
                  <Star className="h-4 w-4 text-emerald-400" />
                  Good to Have
                  <Badge
                    variant="outline"
                    className="ml-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs px-1.5 py-0"
                  >
                    {analysis.good_to_have_keywords.length}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.good_to_have_keywords.map((kw, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    >
                      {kw}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Minimum Qualifications */}
            {analysis.minimum_qualifications.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-200">
                  <GraduationCap className="h-4 w-4 text-blue-400" />
                  Minimum Qualifications
                </div>
                <div className="space-y-2">
                  {analysis.minimum_qualifications.map((qual, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-gray-800 bg-gray-900/30 px-3 py-2 text-sm text-gray-300"
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
            <div className="mb-4 rounded-full bg-gray-500/10 p-4">
              <AlertCircle className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="mb-1 font-medium text-white">No Analysis Available</h3>
            <p className="text-center text-sm text-gray-400 max-w-xs">
              Analysis data is not available for this job posting.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
