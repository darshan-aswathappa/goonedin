"use client";

import { memo, useState } from "react";
import { Job, useJobsStore } from "@/store/jobs";
import {
  Buildings,
  MapPin,
  Clock,
  ArrowSquareOut,
  X,
  ThumbsDown,
  BookmarkSimple,
  CurrencyDollar,
  Globe,
  CircleNotch,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { getAuthHeaders } from "@/hooks/useAuth";
import { JobAnalysisModal } from "./JobAnalysisModal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface JobCardProps {
  job: Job;
  isLocked?: boolean;
}

function JobCardComponent({ job, isLocked = false }: JobCardProps) {
  const [isBlocking, setIsBlocking] = useState(false);
  const [isBlockFlash, setIsBlockFlash] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [animateSave, setAnimateSave] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [cardHovered, setCardHovered] = useState(false);
  const [saveHovered, setSaveHovered] = useState(false);
  const [dismissHovered, setDismissHovered] = useState(false);
  const [blockHovered, setBlockHovered] = useState(false);
  const [applyHovered, setApplyHovered] = useState(false);

  const removeJob = useJobsStore((state) => state.removeJob);
  const savedJobIds = useJobsStore((state) => state.savedJobIds);
  const addSavedJobId = useJobsStore((state) => state.addSavedJobId);
  const removeSavedJobId = useJobsStore((state) => state.removeSavedJobId);

  const isSaved = savedJobIds.has(job.external_id);
  const isAnyActionInFlight = isSaving || isDismissing || isBlocking;

  const formatSalary = (salary: string) => {
    if (!salary) return salary;
    const parts = salary.split(":");
    const range = parts.length > 1 ? parts[1].trim() : parts[0].trim();
    return range;
  };

  const formatVisa = (visa: string) => {
    if (!visa) return visa;
    const vLower = visa.toLowerCase();
    if (
      (vLower.includes("without") && vLower.includes("sponsorship")) ||
      vLower.includes("not eligible") ||
      vLower.includes("does not sponsor") ||
      vLower.includes("no sponsorship") ||
      (vLower.includes("eligible") && vLower.includes("without"))
    ) {
      return "Not eligible for sponsorship";
    }
    return visa;
  };

  let postedAt: string | null = null;
  if (job.posted_at) {
    try {
      postedAt = formatDistanceToNow(new Date(job.posted_at), { addSuffix: true });
    } catch {
      // malformed date — skip display
    }
  }

  const handleBlockCompany = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBlocking) return;
    setIsBlocking(true);
    setIsBlockFlash(true);
    setTimeout(() => setIsBlockFlash(false), 350);
    try {
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      await fetch(`${API_URL}/jobs/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ company: job.company }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch {
      // Timeout or network error — WebSocket broadcast handles UI update
    } finally {
      setIsBlocking(false);
    }
  };

  const handleDismissJob = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDismissing) return;
    setIsDismissing(true);
    try {
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_URL}/jobs/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          source: job.source,
          external_id: job.external_id,
          is_custom: job.is_custom ?? false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setIsExiting(true);
        setTimeout(() => removeJob(job.external_id), 180);
      }
    } catch {
      // Timeout or network error — job stays visible
    } finally {
      setIsDismissing(false);
    }
  };

  const handleToggleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      if (isSaved) {
        const res = await fetch(`${API_URL}/jobs/saved/${job.external_id}`, {
          method: "DELETE",
          headers: { ...headers },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          removeSavedJobId(job.external_id);
        }
      } else {
        const res = await fetch(`${API_URL}/jobs/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            external_id: job.external_id,
            title: job.title,
            company: job.company,
            location: job.location,
            url: job.url,
            source: job.source,
            posted_at: job.posted_at || null,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          addSavedJobId(job.external_id);
          setAnimateSave(true);
          setTimeout(() => setAnimateSave(false), 400);
        }
      }
    } catch {
      // Timeout or network error — save state unchanged
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div
        onClick={!isLocked && (job.source === "LinkedIn" || job.source === "Jobright") ? () => setAnalysisOpen(true) : undefined}
        onMouseEnter={() => setCardHovered(true)}
        onMouseLeave={() => setCardHovered(false)}
        className={`group relative h-full flex flex-col ${
          isLocked ? "pointer-events-none opacity-80" : "cursor-pointer"
        } ${isExiting ? "animate-card-exit" : ""}`}
        style={{
          background: "#080808",
          border: cardHovered ? "1px solid #333" : "1px solid #1c1c1c",
          borderRadius: "2px",
          padding: "14px",
          transition: "border-color 0.1s",
        }}
      >
        {isBlockFlash && (
          <div
            className="absolute inset-0 animate-block-flash pointer-events-none z-20"
            style={{ background: "rgba(255,51,51,0.15)" }}
          />
        )}

        {/* Source badge */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "8px",
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#ff8c00",
            background: "#080808",
            border: "1px solid #1c1c1c",
            borderTop: "none",
            borderRight: "none",
            padding: "3px 8px",
          }}
        >
          {job.source}
        </div>

        <div className="flex flex-col h-full space-y-3">
          <div className="space-y-1.5 pr-10 sm:pr-12 min-w-0">
            <h3
              className="font-mono font-semibold leading-tight line-clamp-3 sm:line-clamp-2 break-words"
              style={{ fontSize: "13px", color: "#f0f0f0", letterSpacing: "0.01em" }}
            >
              {job.title}
            </h3>
            <div className="flex items-center gap-2 min-w-0">
              <Buildings
                weight="bold"
                className="h-4 w-4 shrink-0"
                style={{ color: "#555" }}
              />
              <span
                className="truncate"
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "#aaaaaa",
                  letterSpacing: "0.05em",
                }}
              >
                {job.company}
              </span>
            </div>
          </div>

          <div
            className="grid grid-cols-1 gap-2 pt-2"
            style={{ borderTop: "1px solid #1c1c1c" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <MapPin
                weight="bold"
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: "#555" }}
              />
              <span
                className="truncate"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "#555",
                  letterSpacing: "0.05em",
                }}
              >
                {job.location}
              </span>
            </div>

            {postedAt && (
              <div className="flex items-center gap-2 min-w-0">
                <Clock
                  weight="bold"
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: "#555" }}
                />
                <span
                  className="whitespace-nowrap"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    color: "#555",
                    letterSpacing: "0.05em",
                  }}
                >
                  {postedAt}
                </span>
              </div>
            )}

            {(job.source === "LinkedIn" || job.source === "Jobright") && job.salary && (
              <div
                style={{
                  border: "1px solid #1c1c1c",
                  background: "rgba(255, 215, 0, 0.05)",
                  color: "#ffd700",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  width: "fit-content",
                  maxWidth: "100%",
                  overflow: "hidden",
                }}
              >
                <CurrencyDollar weight="bold" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{formatSalary(job.salary)}</span>
              </div>
            )}

            {(job.source === "LinkedIn" || job.source === "Jobright") && job.visa && (() => {
              const formatted = formatVisa(job.visa);
              const isPositive = formatted.toLowerCase().includes("sponsor") && !formatted.toLowerCase().includes("not eligible");
              if (isPositive) return null;
              return (
                <div
                  style={{
                    border: "1px solid rgba(255,51,51,0.3)",
                    background: "rgba(255,51,51,0.05)",
                    color: "#ff3333",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    width: "fit-content",
                    maxWidth: "100%",
                    overflow: "hidden",
                  }}
                >
                  <Globe weight="bold" className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{formatted}</span>
                </div>
              );
            })()}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 mt-auto">
            <TooltipProvider>
              <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
                {/* Save button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleToggleSave}
                      disabled={isAnyActionInFlight}
                      aria-label={isSaved ? "Unsave job" : "Save job"}
                      title={isSaved ? "Unsave" : "Save"}
                      onMouseEnter={() => setSaveHovered(true)}
                      onMouseLeave={() => setSaveHovered(false)}
                      className="flex-1 sm:flex-none disabled:opacity-50"
                      style={{
                        border: isSaved
                          ? "1px solid #ffd700"
                          : saveHovered
                          ? "1px solid #ffd700"
                          : "1px solid #1c1c1c",
                        background: isSaved ? "rgba(255,215,0,0.08)" : "transparent",
                        color: isSaved ? "#ffd700" : saveHovered ? "#ffd700" : "#555",
                        padding: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "36px",
                        minWidth: "36px",
                        transition: "border-color 0.1s, color 0.1s",
                        borderRadius: "2px",
                      }}
                    >
                      {isSaving ? (
                        <CircleNotch weight="bold" className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      ) : (
                        <BookmarkSimple
                          weight={isSaved ? "fill" : "bold"}
                          className={`h-4 w-4 sm:h-5 sm:w-5 ${animateSave ? "animate-save-pop" : ""}`}
                        />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    className="rounded-none font-mono text-[10px] hidden sm:block"
                    style={{ background: "#080808", border: "1px solid #333", color: "#aaa" }}
                  >
                    <p>{isSaved ? "Unsave" : "Save"}</p>
                  </TooltipContent>
                </Tooltip>

                {/* Dismiss button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleDismissJob}
                      disabled={isAnyActionInFlight}
                      aria-label="Dismiss job"
                      title="Dismiss"
                      onMouseEnter={() => setDismissHovered(true)}
                      onMouseLeave={() => setDismissHovered(false)}
                      className="flex-1 sm:flex-none disabled:opacity-50"
                      style={{
                        border: dismissHovered ? "1px solid #ff3333" : "1px solid #1c1c1c",
                        background: "transparent",
                        color: dismissHovered ? "#ff3333" : "#555",
                        padding: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "36px",
                        minWidth: "36px",
                        transition: "border-color 0.1s, color 0.1s",
                        borderRadius: "2px",
                      }}
                    >
                      {isDismissing ? (
                        <CircleNotch weight="bold" className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      ) : (
                        <X weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    className="rounded-none font-mono text-[10px] hidden sm:block"
                    style={{ background: "#080808", border: "1px solid #333", color: "#aaa" }}
                  >
                    <p>Dismiss</p>
                  </TooltipContent>
                </Tooltip>

                {/* Block button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleBlockCompany}
                      disabled={isAnyActionInFlight}
                      aria-label="Block company"
                      title="Block"
                      onMouseEnter={() => setBlockHovered(true)}
                      onMouseLeave={() => setBlockHovered(false)}
                      className="flex-1 sm:flex-none disabled:opacity-50"
                      style={{
                        border: blockHovered ? "1px solid #ff3333" : "1px solid #1c1c1c",
                        background: "transparent",
                        color: blockHovered ? "#ff3333" : "#555",
                        padding: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "36px",
                        minWidth: "36px",
                        transition: "border-color 0.1s, color 0.1s",
                        borderRadius: "2px",
                      }}
                    >
                      {isBlocking ? (
                        <CircleNotch weight="bold" className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      ) : (
                        <ThumbsDown weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    className="rounded-none font-mono text-[10px] hidden sm:block"
                    style={{ background: "#080808", border: "1px solid #333", color: "#aaa" }}
                  >
                    <p>Block Company</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>

            {/* Apply button */}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={() => setApplyHovered(true)}
              onMouseLeave={() => setApplyHovered(false)}
              className="w-full sm:w-auto"
              style={{
                border: "1px solid #ff8c00",
                background: applyHovered ? "rgba(255,140,0,0.18)" : "rgba(255,140,0,0.1)",
                color: "#ff8c00",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "6px 14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition: "background 0.1s, border-color 0.1s",
                borderRadius: "2px",
              }}
            >
              Apply
              <ArrowSquareOut weight="bold" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </a>
          </div>
        </div>
      </div>

      {(job.source === "LinkedIn" || job.source === "Jobright") && (
        <JobAnalysisModal
          job={job}
          open={analysisOpen}
          onOpenChange={setAnalysisOpen}
        />
      )}
    </>
  );
}

export const JobCard = memo(JobCardComponent);
