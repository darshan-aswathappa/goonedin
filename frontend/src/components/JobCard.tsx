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
  Briefcase,
  CircleNotch,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { getAuthHeaders } from "@/hooks/useAuth";
import { JobAnalysisModal } from "./JobAnalysisModal";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Chip, DsCard, dsButtonVariants } from "@/components/ds";
import { cn } from "@/lib/utils";
import { isSponsorshipIneligible } from "@/lib/visaFilter";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Hairline icon button: neutral at rest, brick on hover. */
const ICON_BUTTON_CLASS =
  "flex flex-1 items-center justify-center rounded-md border border-hairline bg-paper-card p-1.5 text-ink-muted transition-colors duration-[120ms] hover:border-brick hover:text-brick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brick/40 disabled:opacity-50 disabled:hover:border-hairline disabled:hover:text-ink-muted sm:flex-none min-h-11 min-w-11";

const META_CLASS = "font-mono text-[11px] tracking-[0.09em] text-ink-muted";

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
  const removeJobsByCompany = useJobsStore((state) => state.removeJobsByCompany);
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
    if (isSponsorshipIneligible(visa)) {
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

      const response = await fetch(`${API_URL}/jobs/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ company: job.company }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          toast.error("Please sign in again");
        } else {
          toast.error(`Couldn't block ${job.company}. Try again.`);
        }
      } else {
        removeJobsByCompany(job.company);
        toast.success(`Blocked ${job.company}`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("Request timed out. Try again.");
      } else {
        toast.error("Network error. Couldn't block company.");
      }
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
      } else if (response.status === 401) {
        toast.error("Please sign in again");
      } else {
        toast.error("Couldn't dismiss job. Try again.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("Request timed out. Try again.");
      } else {
        toast.error("Network error. Couldn't dismiss job.");
      }
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
        } else if (res.status === 401) {
          toast.error("Please sign in again");
        } else {
          toast.error("Couldn't unsave job. Try again.");
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
        } else if (res.status === 401) {
          toast.error("Please sign in again");
        } else {
          toast.error("Couldn't save job. Try again.");
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("Request timed out. Try again.");
      } else {
        toast.error("Network error. Couldn't update saved jobs.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isAnalyzable =
    job.source === "LinkedIn" || job.source === "Jobright" || job.source === "Greenhouse";
  const hasEnrichedFields =
    job.source === "LinkedIn" ||
    job.source === "Jobright" ||
    job.source === "Indeed" ||
    job.source === "Greenhouse";

  return (
    <>
      <DsCard
        onClick={!isLocked && isAnalyzable ? () => setAnalysisOpen(true) : undefined}
        className={cn(
          "group flex h-full flex-col p-4",
          isLocked && "pointer-events-none opacity-80",
          !isLocked && isAnalyzable && "cursor-pointer",
          isExiting && "animate-card-exit"
        )}
      >
        {isBlockFlash && (
          <div className="pointer-events-none absolute inset-0 z-20 animate-block-flash bg-brick/15" />
        )}

        {/* Source badge — mono corner tab */}
        <div className="absolute right-0 top-0 max-w-[45%] truncate rounded-bl-[4px] rounded-tr-[3px] border-b border-l border-hairline bg-paper-sunk px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.09em] text-ink-muted">
          {job.source}
        </div>

        <div className="flex h-full flex-col gap-3">
          <div className="min-w-0 space-y-1.5 pr-10 sm:pr-12">
            <h3 className="line-clamp-3 break-words font-serif text-[18px] font-semibold leading-tight text-ink sm:line-clamp-2">
              {job.title}
            </h3>
            <div className="flex min-w-0 items-center gap-2">
              <Buildings weight="regular" className="size-4 shrink-0 text-ink-muted" />
              <span className="truncate font-mono text-[11px] tracking-[0.09em] text-ink-2">
                {job.company}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 border-t border-hairline pt-3">
            <div className="flex min-w-0 items-center gap-2">
              <MapPin weight="regular" className="size-4 shrink-0 text-ink-muted" />
              <span className={cn("truncate", META_CLASS)}>{job.location}</span>
            </div>

            {postedAt && (
              <div className="flex min-w-0 items-center gap-2">
                <Clock weight="regular" className="size-4 shrink-0 text-ink-muted" />
                <span className={cn("whitespace-nowrap", META_CLASS)}>{postedAt}</span>
              </div>
            )}

            {hasEnrichedFields && job.salary && (
              <Chip
                tone="success"
                className="w-fit max-w-full gap-1.5 overflow-hidden px-2 py-1 text-[11px] tracking-[0.04em]"
              >
                <CurrencyDollar weight="regular" className="size-3.5 shrink-0" />
                <span className="truncate">{formatSalary(job.salary)}</span>
              </Chip>
            )}

            {hasEnrichedFields && job.visa && (() => {
              const formatted = formatVisa(job.visa);
              const isPositive = formatted.toLowerCase().includes("sponsor") && !formatted.toLowerCase().includes("not eligible");
              if (isPositive) return null;
              return (
                <Chip
                  tone="accent"
                  className="w-fit max-w-full gap-1.5 overflow-hidden px-2 py-1 text-[11px] tracking-[0.04em]"
                >
                  <Globe weight="regular" className="size-3.5 shrink-0" />
                  <span className="truncate">{formatted}</span>
                </Chip>
              );
            })()}

            {typeof job.min_exp === "number" && job.min_exp >= 1 && (
              <Chip
                tone="default"
                className="w-fit max-w-full gap-1.5 overflow-hidden px-2 py-1 text-[11px] tracking-[0.04em]"
              >
                <Briefcase weight="regular" className="size-3.5 shrink-0" />
                <span className="truncate">
                  Min. {job.min_exp} {job.min_exp === 1 ? "yr" : "yrs"} experience
                </span>
              </Chip>
            )}
          </div>

          <div className="mt-auto flex flex-col items-center justify-between gap-2 border-t border-hairline pt-3 sm:flex-row">
            <TooltipProvider>
              <div className="flex w-full gap-1 sm:w-auto sm:gap-2">
                {/* Save button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleToggleSave}
                      disabled={isAnyActionInFlight}
                      aria-label={isSaved ? "Unsave job" : "Save job"}
                      title={isSaved ? "Unsave" : "Save"}
                      className={cn(
                        ICON_BUTTON_CLASS,
                        isSaved && "border-brick bg-brick-tint text-brick"
                      )}
                    >
                      {isSaving ? (
                        <CircleNotch weight="regular" className="size-4 animate-spin" />
                      ) : (
                        <BookmarkSimple
                          weight={isSaved ? "fill" : "regular"}
                          className={cn("size-4", animateSave && "animate-save-pop")}
                        />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="hidden sm:block">
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
                      className={ICON_BUTTON_CLASS}
                    >
                      {isDismissing ? (
                        <CircleNotch weight="regular" className="size-4 animate-spin" />
                      ) : (
                        <X weight="regular" className="size-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="hidden sm:block">
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
                      className={ICON_BUTTON_CLASS}
                    >
                      {isBlocking ? (
                        <CircleNotch weight="regular" className="size-4 animate-spin" />
                      ) : (
                        <ThumbsDown weight="regular" className="size-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="hidden sm:block">
                    <p>Block company</p>
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
              className={cn(
                dsButtonVariants({ variant: "primary", size: "sm" }),
                "w-full no-underline sm:w-auto"
              )}
            >
              Apply
              <ArrowSquareOut weight="regular" className="size-4" />
            </a>
          </div>
        </div>
      </DsCard>

      {isAnalyzable && (
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
