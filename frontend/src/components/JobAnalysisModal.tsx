"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Job, JobAnalysis } from "@/store/jobs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  WarningCircle,
  CircleNotch,
  X,
} from "@phosphor-icons/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { getAuthHeaders } from "@/hooks/useAuth";
import { Kicker, Chip, DsButton } from "@/components/ds";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface JobAnalysisModalProps {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LOADING_MESSAGES = [
  "PARSING REQUIREMENTS",
  "EXTRACTING KEYWORDS",
  "CALIBRATING MATCH SCORE",
  "ANALYZING ROLE FIT",
];

export function JobAnalysisModal({ job, open, onOpenChange }: JobAnalysisModalProps) {
  const [fetchedAnalysis, setFetchedAnalysis] = useState<JobAnalysis | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "done" | "failed" | "pending">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [msgIdx, setMsgIdx] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const analysis: JobAnalysis | null = job.analysis || fetchedAnalysis;

  useEffect(() => {
    if (fetchStatus !== "loading") return;
    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const doFetch = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFetchStatus("loading");
    setErrorMessage(null);
    setFetchedAnalysis(null);

    const isStale = () => abortRef.current !== controller;

    try {
      const headers = await getAuthHeaders();
      if (isStale()) return;
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(
        `${API_URL}/jobs/${job.external_id}/analysis`,
        { headers, signal: controller.signal }
      );
      clearTimeout(timeoutId);
      if (isStale()) return;

      if (response.ok) {
        const data = await response.json();
        if (isStale()) return;
        if (data.status === "completed" && data.analysis) {
          setFetchedAnalysis({
            must_have_keywords: data.analysis.must_have_keywords || [],
            good_to_have_keywords: data.analysis.good_to_have_keywords || [],
            minimum_qualifications: data.analysis.minimum_qualifications || [],
            summary: data.analysis.summary || "",
          });
          setFetchStatus("done");
        } else if (data.status === "processing" || data.status === "pending") {
          setFetchStatus("pending");
        } else {
          setFetchStatus("failed");
          setErrorMessage("Analysis isn't available for this posting yet.");
        }
      } else if (response.status === 401) {
        setFetchStatus("failed");
        setErrorMessage("Please sign in again to view analysis.");
      } else if (response.status === 404) {
        setFetchStatus("failed");
        setErrorMessage("Analysis not found for this job.");
      } else if (response.status >= 500) {
        setFetchStatus("failed");
        setErrorMessage("Server error while loading analysis.");
      } else {
        setFetchStatus("failed");
        setErrorMessage("Couldn't load analysis. Try again.");
      }
    } catch (err) {
      if (isStale()) return;
      if (err instanceof DOMException && err.name === "AbortError") {
        setFetchStatus("failed");
        setErrorMessage("Request timed out. Check your connection and try again.");
      } else {
        setFetchStatus("failed");
        setErrorMessage("Network error. Check your connection and try again.");
      }
    }
  }, [job.external_id]);

  useEffect(() => {
    if (!open) return;
    if (job.analysis) return;
    if (fetchStatus !== "idle") return;
    void doFetch();
  }, [open, job.analysis, fetchStatus, doFetch]);

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      abortRef.current?.abort();
      setFetchStatus("idle");
      setFetchedAnalysis(null);
      setErrorMessage(null);
    }
  };

  const handleRetry = () => {
    void doFetch();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90dvh] overflow-y-auto gap-0 p-0 focus:outline-none rounded-[10px] border border-hairline bg-paper shadow-[var(--shadow-modal)] max-w-[calc(100%-1.5rem)] sm:max-w-2xl"
      >
        {/* Header */}
        <DialogHeader className="relative flex flex-col gap-1 border-b border-hairline bg-paper-card px-5 py-5 text-left sm:px-8 sm:py-7">
          <Kicker>Job analysis</Kicker>
          <DialogTitle asChild>
            <h2 className="line-clamp-2 pr-10 font-serif text-[22px] font-semibold leading-tight text-ink sm:text-[28px]">
              {job.title}
            </h2>
          </DialogTitle>
          <p className="mt-1 truncate font-sans text-[13px] leading-snug text-ink-2 sm:text-[15px]" title={job.company}>
            {job.company}
          </p>

          <DialogPrimitive.Close
            className="absolute right-3 top-3 flex size-10 cursor-pointer items-center justify-center rounded-[4px] border border-hairline bg-transparent text-ink-muted transition-colors duration-[120ms] hover:border-brick hover:text-brick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brick/40 sm:right-5 sm:top-5"
          >
            <X weight="regular" className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogHeader>

        {/* Content */}
        <div className="bg-paper px-5 py-6 sm:px-8 sm:py-8">
          {!analysis && fetchStatus === "loading" ? (
            <div className="ds-well flex flex-col items-center justify-center gap-4 px-4 py-10 sm:py-14">
              <CircleNotch
                weight="regular"
                className="size-4 animate-spin text-ink-muted"
              />
              <div
                key={msgIdx}
                className="animate-msg-in font-mono text-[11px] uppercase tracking-[0.09em] text-ink-2"
              >
                {LOADING_MESSAGES[msgIdx]}<span className="animate-cursor-blink">_</span>
              </div>
            </div>
          ) : job.analysis_status === "unavailable" && !analysis ? (
            <div className="ds-well flex flex-col items-center justify-center gap-3 px-4 py-10 text-center sm:py-14">
              <div className="flex items-center gap-2">
                <WarningCircle weight="regular" className="size-4 text-ink-muted" />
                <h3 className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-2">
                  Couldn&apos;t Analyze
                </h3>
              </div>
              <p className="max-w-[320px] font-sans text-[13px] leading-relaxed text-ink-muted">
                We couldn&apos;t analyze this job. Check the original posting for details.
              </p>
            </div>
          ) : fetchStatus === "failed" && !analysis ? (
            <div
              role="alert"
              className="ds-well flex flex-col items-center justify-center gap-3 px-4 py-10 text-center sm:py-14"
            >
              <div className="flex items-center gap-2">
                <WarningCircle weight="regular" className="size-4 text-brick" />
                <h3 className="font-mono text-[11px] uppercase tracking-[0.09em] text-brick">
                  Analysis failed
                </h3>
              </div>
              <p className="max-w-[320px] break-words font-sans text-[13px] leading-relaxed text-ink-muted">
                {errorMessage || "Couldn't load analysis. Try again."}
              </p>
              <DsButton variant="secondary" size="sm" onClick={handleRetry}>
                Try again
              </DsButton>
            </div>
          ) : fetchStatus === "pending" && !analysis ? (
            <div className="ds-well flex flex-col items-center justify-center gap-3 px-4 py-10 text-center sm:py-14">
              <div className="flex items-center gap-2">
                <CircleNotch weight="regular" className="size-4 animate-spin text-ink-muted" />
                <h3 className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-2">
                  Analysis Queued
                </h3>
              </div>
              <p className="max-w-[320px] font-sans text-[13px] leading-relaxed text-ink-muted">
                This job is in the analysis queue. It will be ready shortly.
              </p>
              <DsButton variant="ghost" size="sm" onClick={handleRetry}>
                Check again
              </DsButton>
            </div>
          ) : analysis ? (
            <div className="space-y-8 sm:space-y-10">
              {analysis.summary && (
                <div
                  className="ds-well animate-tab-in px-4 py-4 sm:px-5"
                  style={{ animationDelay: "0ms" }}
                >
                  <Kicker className="mb-2">Summary</Kicker>
                  <p className="font-sans text-[13px] leading-relaxed text-ink-2 sm:text-[15px]">
                    {analysis.summary}
                  </p>
                </div>
              )}

              {analysis.must_have_keywords.length > 0 && (
                <div className="animate-tab-in" style={{ animationDelay: "80ms" }}>
                  <Kicker
                    className="mb-3 text-brick"
                    count={analysis.must_have_keywords.length}
                  >
                    Must-have
                  </Kicker>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {analysis.must_have_keywords.map((kw, i) => (
                      <Chip
                        key={i}
                        tone="accent"
                        className="animate-tab-in px-2.5 py-1 text-[11px]"
                        style={{ animationDelay: `${80 + i * 22}ms` }}
                      >
                        {kw}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {analysis.good_to_have_keywords.length > 0 && (
                <div className="animate-tab-in" style={{ animationDelay: "160ms" }}>
                  <Kicker
                    className="mb-3"
                    count={analysis.good_to_have_keywords.length}
                  >
                    Nice-to-have
                  </Kicker>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {analysis.good_to_have_keywords.map((kw, i) => (
                      <Chip
                        key={i}
                        tone="sunk"
                        className="animate-tab-in px-2.5 py-1 text-[11px] text-ink-2"
                        style={{ animationDelay: `${240 + i * 22}ms` }}
                      >
                        {kw}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {analysis.minimum_qualifications.length > 0 && (
                <div className="animate-tab-in" style={{ animationDelay: "240ms" }}>
                  <Kicker className="mb-3">Education</Kicker>
                  <div className="space-y-2">
                    {analysis.minimum_qualifications.map((qual, i) => (
                      <div
                        key={i}
                        className="ds-well px-3 py-2 font-sans text-[13px] leading-relaxed text-ink-2"
                      >
                        {qual}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="ds-well flex flex-col items-center justify-center gap-3 px-4 py-10 text-center sm:py-14">
              <div className="flex items-center gap-2">
                <WarningCircle weight="regular" className="size-4 text-ink-muted" />
                <h3 className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-2">
                  Analysis Queued
                </h3>
              </div>
              <p className="max-w-[320px] font-sans text-[13px] leading-relaxed text-ink-muted">
                This job is in the analysis queue. It will be ready shortly.
              </p>
              <DsButton variant="ghost" size="sm" onClick={handleRetry}>
                Check again
              </DsButton>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
