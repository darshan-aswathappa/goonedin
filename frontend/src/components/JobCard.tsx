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
  
  const removeJob = useJobsStore((state) => state.removeJob);
  const savedJobIds = useJobsStore((state) => state.savedJobIds);
  const addSavedJobId = useJobsStore((state) => state.addSavedJobId);
  const removeSavedJobId = useJobsStore((state) => state.removeSavedJobId);
  
  const isSaved = savedJobIds.has(job.external_id);
  const isAnyActionInFlight = isSaving || isDismissing || isBlocking;
  
  const formatSalary = (salary: string) => {
    if (!salary) return salary;
    // Extract part after colon if it exists: "Location: $range" -> "$range"
    const parts = salary.split(":");
    const range = parts.length > 1 ? parts[1].trim() : parts[0].trim();
    return range;
  };

  const formatVisa = (visa: string) => {
    if (!visa) return visa;
    const vLower = visa.toLowerCase();
    // If it mentions "without visa sponsorship" or "no sponsorship"
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
      // WebSocket will broadcast the block and show the toast
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
        className={`group relative brutal-border brutal-shadow bg-card p-6 transition-all duration-100 hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_0px_var(--border)] h-full flex flex-col ${
          isLocked ? "pointer-events-none opacity-80" : "cursor-pointer"
        } ${isExiting ? "animate-card-exit" : ""}`}
      >
        {isBlockFlash && (
          <div className="absolute inset-0 bg-red-500/25 animate-block-flash pointer-events-none z-20" />
        )}

        <div
          className="absolute top-0 right-0 brutal-border border-t-0 border-r-0 px-3 py-1 text-[10px] font-bold uppercase tracking-wider brutal-badge bg-primary text-primary-foreground"
        >
          {job.source}
        </div>

        <div className="flex flex-col h-full space-y-2 sm:space-y-4">
          <div className="space-y-0.5 sm:space-y-1 pr-10 sm:pr-12 min-w-0">
            <h3 className="text-sm sm:text-xl heading-brutal leading-tight line-clamp-3 sm:line-clamp-2 break-words">
              {job.title}
            </h3>
            <div className="flex items-center gap-2 font-bold text-xs sm:text-sm min-w-0">
              <Buildings weight="bold" className="h-4 w-4 shrink-0" />
              <span className="truncate">{job.company}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-1.5 sm:gap-2 border-t-2 border-border pt-2 sm:pt-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium min-w-0">
              <MapPin weight="bold" className="h-4 w-4 shrink-0" />
              <span className="truncate">{job.location}</span>
            </div>

            {postedAt && (
              <div className="flex items-center gap-2 text-xs sm:text-sm font-medium min-w-0">
                <Clock weight="bold" className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{postedAt}</span>
              </div>
            )}

            {(job.source === "LinkedIn" || job.source === "Jobright") && job.salary && (
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 px-1.5 sm:px-2 py-0.5 sm:py-1 brutal-border w-fit max-w-full overflow-hidden shadow-[1px_1px_0px_0px_var(--border)]">
                <CurrencyDollar weight="bold" className="h-4 w-4 shrink-0" />
                <span className="truncate">{formatSalary(job.salary)}</span>
              </div>
            )}

            {(job.source === "LinkedIn" || job.source === "Jobright") && job.visa && (() => {
              const formatted = formatVisa(job.visa);
              const isPositive = formatted.toLowerCase().includes("sponsor") && !formatted.toLowerCase().includes("not eligible");
              if (isPositive) return null;
              return (
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 sm:px-2 py-0.5 sm:py-1 brutal-border w-fit max-w-full overflow-hidden shadow-[1px_1px_0px_0px_var(--border)]">
                  <Globe weight="bold" className="h-4 w-4 shrink-0" />
                  <span className="truncate">{formatted}</span>
                </div>
              );
            })()}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 pt-2 sm:pt-4 mt-auto">
            <TooltipProvider>
            <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleToggleSave}
                    disabled={isAnyActionInFlight}
                    aria-label={isSaved ? "Unsave job" : "Save job"}
                    title={isSaved ? "Unsave" : "Save"}
                    className={`brutal-border p-2 hover:bg-muted transition-colors flex-1 sm:flex-none flex items-center justify-center disabled:opacity-50 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 ${
                      isSaved ? "bg-primary text-white" : "bg-card text-foreground"
                    }`}
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
                <TooltipContent className="brutal-border brutal-shadow rounded-none bg-card text-foreground font-bold hidden sm:block">
                  <p>{isSaved ? "Unsave" : "Save"}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleDismissJob}
                    disabled={isAnyActionInFlight}
                    aria-label="Dismiss job"
                    title="Dismiss"
                    className="brutal-border p-2 bg-card text-foreground hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors flex-1 sm:flex-none flex items-center justify-center disabled:opacity-50 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  >
                    {isDismissing ? (
                      <CircleNotch weight="bold" className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                    ) : (
                      <X weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="brutal-border brutal-shadow rounded-none bg-card text-foreground font-bold hidden sm:block">
                  <p>Dismiss</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleBlockCompany}
                    disabled={isAnyActionInFlight}
                    aria-label="Block company"
                    title="Block"
                    className="brutal-border p-2 bg-card text-foreground hover:bg-foreground hover:text-background transition-colors flex-1 sm:flex-none flex items-center justify-center disabled:opacity-50 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  >
                    {isBlocking ? (
                      <CircleNotch weight="bold" className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                    ) : (
                      <ThumbsDown weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="brutal-border brutal-shadow rounded-none bg-card text-foreground font-bold hidden sm:block">
                  <p>Block Company</p>
                </TooltipContent>
              </Tooltip>

            </div>
            </TooltipProvider>

            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="brutal-border bg-primary text-primary-foreground px-2.5 sm:px-4 py-1.5 sm:py-2 font-black text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-2 brutal-btn-hover uppercase w-full sm:w-auto"
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
