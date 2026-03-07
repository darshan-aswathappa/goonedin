"use client";

import { useState } from "react";
import { Job } from "@/store/jobs";
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

interface JobAnalysis {
  must_have_keywords: string[];
  good_to_have_keywords: string[];
  minimum_qualifications: string[];
  summary: string;
}

interface JobAnalysisModalProps {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JobAnalysisModal({ job, open, onOpenChange }: JobAnalysisModalProps) {
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "completed" | "failed">("idle");

  const fetchAnalysis = async () => {
    if (status === "loading") return;

    setStatus("loading");
    setAnalysis(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${API_URL}/jobs/${job.external_id}/analysis`,
        { headers }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.status === "completed" && data.analysis) {
          setAnalysis({
            must_have_keywords: data.analysis.must_have_keywords || [],
            good_to_have_keywords: data.analysis.good_to_have_keywords || [],
            minimum_qualifications: data.analysis.minimum_qualifications || [],
            summary: data.analysis.summary || "",
          });
          setStatus("completed");
        } else {
          setStatus("failed");
        }
      } else {
        setStatus("failed");
      }
    } catch (error) {
      console.error("Failed to fetch job analysis:", error);
      setStatus("failed");
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (isOpen && status === "idle") {
      fetchAnalysis();
    }
    if (!isOpen) {
      // Reset on close if it was a failure so user can retry
      if (status === "failed") {
        setStatus("idle");
        setAnalysis(null);
      }
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

        {status === "loading" ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
              <div className="relative rounded-full bg-amber-500/10 p-4">
                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              </div>
            </div>
            <h3 className="mb-1 font-medium text-white">Analyzing Job Description</h3>
            <p className="text-center text-sm text-gray-400 max-w-xs">
              DeepSeek AI is extracting keywords and qualifications.
              <br />
              This may take 15–30 seconds on first analysis.
            </p>
          </div>
        ) : status === "failed" ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 rounded-full bg-red-500/10 p-4">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <h3 className="mb-1 font-medium text-white">Analysis Failed</h3>
            <p className="text-center text-sm text-gray-400 mb-4">
              Could not analyze this job description. The job posting might not be available.
            </p>
            <button
              onClick={fetchAnalysis}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Try Again
            </button>
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
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
