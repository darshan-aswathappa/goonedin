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
  "PARSING REQUIREMENTS",
  "EXTRACTING KEYWORDS",
  "CALIBRATING MATCH SCORE",
  "ANALYZING ROLE FIT",
];

export function JobAnalysisModal({ job, open, onOpenChange }: JobAnalysisModalProps) {
  const [fetchedAnalysis, setFetchedAnalysis] = useState<JobAnalysis | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [msgIdx, setMsgIdx] = useState(0);
  const [closeHovered, setCloseHovered] = useState(false);
  const [kwHovered, setKwHovered] = useState<Record<string, number>>({});

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
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl max-h-[90dvh] overflow-y-auto p-0 gap-0 focus:outline-none rounded-none max-w-[calc(100%-1.5rem)] sm:max-w-2xl"
        style={{ background: "#060606", border: "1px solid #333", boxShadow: "none" }}
      >
        {/* Header */}
        <DialogHeader
          style={{
            background: "#080808",
            borderBottom: "1px solid #1c1c1c",
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            position: "relative",
          }}
        >
          <DialogTitle asChild>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  color: "#ff8c00",
                  textTransform: "uppercase",
                }}
              >
                {"// ANALYSIS"}
              </div>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "#555",
                  fontWeight: 400,
                  marginTop: "2px",
                }}
                className="line-clamp-2"
              >
                {job.title} — {job.company}
              </p>
            </div>
          </DialogTitle>

          <DialogPrimitive.Close
            onMouseEnter={() => setCloseHovered(true)}
            onMouseLeave={() => setCloseHovered(false)}
            style={{
              position: "absolute",
              right: "12px",
              top: "12px",
              background: "transparent",
              border: closeHovered ? "1px solid #ff3333" : "1px solid #1c1c1c",
              color: closeHovered ? "#ff3333" : "#555",
              padding: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-color 0.1s, color 0.1s",
              borderRadius: "2px",
            }}
          >
            <X weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogHeader>

        {/* Content */}
        <div style={{ background: "#000", padding: "16px" }}>
          {!analysis && fetchStatus === "loading" ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12">
              <CircleNotch
                weight="bold"
                className="h-8 w-8 sm:h-12 sm:w-12 animate-spin mb-2 sm:mb-4"
                style={{ color: "#ff8c00" }}
              />
              <div
                key={msgIdx}
                className="animate-msg-in"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "#ff8c00",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {LOADING_MESSAGES[msgIdx]}<span className="animate-cursor-blink">_</span>
              </div>
            </div>
          ) : job.analysis_status === "unavailable" && !analysis ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-2 text-center">
              <WarningCircle weight="bold" className="h-8 w-8 sm:h-12 sm:w-12 mb-2 sm:mb-4" style={{ color: "#555" }} />
              <h3
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "#aaa",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: "8px",
                }}
              >
                Couldn&apos;t Analyze
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "#555",
                  maxWidth: "280px",
                  lineHeight: 1.6,
                }}
              >
                We couldn&apos;t analyze this job. Check the original posting for details.
              </p>
            </div>
          ) : analysis ? (
            <div className="space-y-4 sm:space-y-8">
              {analysis.summary && (
                <div
                  className="animate-tab-in"
                  style={{
                    background: "#080808",
                    border: "1px solid #1c1c1c",
                    padding: "12px 16px",
                    borderRadius: "2px",
                    animationDelay: "0ms",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      fontWeight: 600,
                      letterSpacing: "0.18em",
                      color: "#ff8c00",
                      textTransform: "uppercase",
                      marginBottom: "8px",
                    }}
                  >
                    {"// SUMMARY"}
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      color: "#aaa",
                      lineHeight: 1.6,
                    }}
                  >
                    {analysis.summary}
                  </p>
                </div>
              )}

              {analysis.must_have_keywords.length > 0 && (
                <div className="space-y-2 sm:space-y-4 animate-tab-in" style={{ animationDelay: "80ms" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9px",
                        fontWeight: 600,
                        letterSpacing: "0.18em",
                        color: "#ff3333",
                        textTransform: "uppercase",
                      }}
                    >
                      {"// MUST-HAVE"}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9px",
                        color: "#ff3333",
                        border: "1px solid rgba(255,51,51,0.4)",
                        padding: "1px 6px",
                        borderRadius: "2px",
                      }}
                    >
                      {analysis.must_have_keywords.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {analysis.must_have_keywords.map((kw, i) => (
                      <div
                        key={i}
                        className="animate-tab-in"
                        onMouseEnter={() => setKwHovered((prev) => ({ ...prev, [`must-${i}`]: 1 }))}
                        onMouseLeave={() => setKwHovered((prev) => ({ ...prev, [`must-${i}`]: 0 }))}
                        style={{
                          border: kwHovered[`must-${i}`] ? "1px solid #ff8c00" : "1px solid #333",
                          background: "#080808",
                          color: kwHovered[`must-${i}`] ? "#ff8c00" : "#f0f0f0",
                          fontFamily: "var(--font-mono)",
                          fontSize: "10px",
                          fontWeight: 600,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          padding: "3px 8px",
                          cursor: "default",
                          transition: "border-color 0.1s, color 0.1s",
                          borderRadius: "2px",
                          animationDelay: `${80 + i * 22}ms`,
                        }}
                      >
                        {kw}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.good_to_have_keywords.length > 0 && (
                <div className="space-y-2 sm:space-y-4 animate-tab-in" style={{ animationDelay: "160ms" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9px",
                        fontWeight: 600,
                        letterSpacing: "0.18em",
                        color: "#ffd700",
                        textTransform: "uppercase",
                      }}
                    >
                      {"// NICE-TO-HAVE"}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9px",
                        color: "#ffd700",
                        border: "1px solid rgba(255,215,0,0.2)",
                        padding: "1px 6px",
                        borderRadius: "2px",
                      }}
                    >
                      {analysis.good_to_have_keywords.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {analysis.good_to_have_keywords.map((kw, i) => (
                      <div
                        key={i}
                        className="animate-tab-in"
                        onMouseEnter={() => setKwHovered((prev) => ({ ...prev, [`nice-${i}`]: 1 }))}
                        onMouseLeave={() => setKwHovered((prev) => ({ ...prev, [`nice-${i}`]: 0 }))}
                        style={{
                          border: kwHovered[`nice-${i}`] ? "1px solid #ff8c00" : "1px solid #333",
                          background: "#080808",
                          color: kwHovered[`nice-${i}`] ? "#ff8c00" : "#f0f0f0",
                          fontFamily: "var(--font-mono)",
                          fontSize: "10px",
                          fontWeight: 600,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          padding: "3px 8px",
                          cursor: "default",
                          transition: "border-color 0.1s, color 0.1s",
                          borderRadius: "2px",
                          animationDelay: `${240 + i * 22}ms`,
                        }}
                      >
                        {kw}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.minimum_qualifications.length > 0 && (
                <div className="space-y-2 sm:space-y-4 animate-tab-in" style={{ animationDelay: "240ms" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      fontWeight: 600,
                      letterSpacing: "0.18em",
                      color: "#ff8c00",
                      textTransform: "uppercase",
                      marginBottom: "8px",
                    }}
                  >
                    {"// EDUCATION"}
                  </div>
                  <div className="space-y-1.5 sm:space-y-3">
                    {analysis.minimum_qualifications.map((qual, i) => (
                      <div
                        key={i}
                        style={{
                          background: "#080808",
                          border: "1px solid #1c1c1c",
                          padding: "8px 12px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "10px",
                          color: "#aaa",
                          lineHeight: 1.5,
                          borderRadius: "2px",
                        }}
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
              <WarningCircle weight="bold" className="h-8 w-8 sm:h-12 sm:w-12 mb-2 sm:mb-4" style={{ color: "#555" }} />
              <h3
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "#aaa",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: "8px",
                }}
              >
                Analysis Queued
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "#555",
                  lineHeight: 1.6,
                }}
              >
                This job is in the analysis queue. It will be ready shortly.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
