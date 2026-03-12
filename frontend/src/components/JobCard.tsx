"use client";

import { useState } from "react";
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
  FileText,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { getAuthHeaders } from "@/hooks/useAuth";
import { JobAnalysisModal } from "./JobAnalysisModal";
import { ResumeMatchModal } from "./ResumeMatchModal";
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

function getSourceColor(source: string) {
  switch (source) {
    case "LinkedIn":
      return "bg-[#0A66C2] text-white";
    case "MathWorks":
      return "bg-[#ED1C24] text-white";
    case "GitHub":
      return "bg-[#24292e] text-white";
    default:
      return "bg-[#2E4057] text-white";
  }
}

export function JobCard({ job, isLocked = false }: JobCardProps) {
  const [isBlocking, setIsBlocking] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [resumeMatchOpen, setResumeMatchOpen] = useState(false);
  
  const removeJob = useJobsStore((state) => state.removeJob);
  const savedJobIds = useJobsStore((state) => state.savedJobIds);
  const addSavedJobId = useJobsStore((state) => state.addSavedJobId);
  const removeSavedJobId = useJobsStore((state) => state.removeSavedJobId);
  
  const isSaved = savedJobIds.has(job.external_id);
  
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

  const postedAt = job.posted_at
    ? formatDistanceToNow(new Date(job.posted_at), { addSuffix: true })
    : null;

  const handleBlockCompany = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBlocking) return;
    setIsBlocking(true);
    try {
      const headers = await getAuthHeaders();
      // WebSocket will broadcast the block and show the toast
      await fetch(`${API_URL}/jobs/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ company: job.company }),
      });
    } catch (error) {
      console.error("Failed to block company:", error);
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
      const response = await fetch(`${API_URL}/jobs/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          source: job.source,
          external_id: job.external_id,
          is_custom: job.is_custom ?? false,
        }),
      });
      if (response.ok) removeJob(job.external_id);
    } catch (error) {
      console.error("Failed to dismiss job:", error);
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
      if (isSaved) {
        const res = await fetch(`${API_URL}/jobs/saved/${job.external_id}`, {
          method: "DELETE",
          headers: { ...headers },
        });
        if (res.ok) removeSavedJobId(job.external_id);
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
        });
        if (res.ok) addSavedJobId(job.external_id);
      }
    } catch (error) {
      console.error("Failed to toggle save job:", error);
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
        }`}
      >
        <div
          className={`absolute top-0 right-0 brutal-border border-t-0 border-r-0 px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${getSourceColor(
            job.source
          )}`}
        >
          {job.source}
        </div>

        <div className="flex flex-col h-full space-y-4">
          <div className="space-y-1 pr-12">
            <h3 className="text-base sm:text-xl font-black leading-tight line-clamp-3 sm:line-clamp-2 italic uppercase tracking-tighter">
              {job.title}
            </h3>
            <div className="flex items-center gap-2 font-bold text-sm min-w-0">
              <Buildings weight="bold" className="h-4 w-4 shrink-0" />
              <span className="truncate">{job.company}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 border-t-2 border-border pt-4">
            <div className="flex items-center gap-2 text-sm font-medium min-w-0">
              <MapPin weight="bold" className="h-4 w-4 shrink-0" />
              <span className="truncate">{job.location}</span>
            </div>

            {postedAt && (
              <div className="flex items-center gap-2 text-sm font-medium min-w-0">
                <Clock weight="bold" className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{postedAt}</span>
              </div>
            )}

            {(job.source === "LinkedIn" || job.source === "Jobright") && job.salary && (
              <div className="flex items-center gap-2 text-sm font-bold text-[#009063] dark:text-[#52c41a] bg-[#E6F4EA] dark:bg-[#009063]/20 px-2 py-1 brutal-border w-fit max-w-full overflow-hidden shadow-[1px_1px_0px_0px_var(--border)]">
                <CurrencyDollar weight="bold" className="h-4 w-4 shrink-0" />
                <span className="truncate">{formatSalary(job.salary)}</span>
              </div>
            )}

            {(job.source === "LinkedIn" || job.source === "Jobright") && job.visa && (() => {
              const formatted = formatVisa(job.visa);
              const isPositive = formatted.toLowerCase().includes("sponsor") && !formatted.toLowerCase().includes("not eligible");
              if (isPositive) return null;
              return (
                <div className="flex items-center gap-2 text-sm font-bold text-[#F15152] dark:text-[#ff4d4f] bg-[#FFEBEB] dark:bg-[#F15152]/20 px-2 py-1 brutal-border w-fit max-w-full overflow-hidden shadow-[1px_1px_0px_0px_var(--border)]">
                  <Globe weight="bold" className="h-4 w-4 shrink-0" />
                  <span className="truncate">{formatted}</span>
                </div>
              );
            })()}
          </div>

          <div className="flex items-center justify-between pt-4 mt-auto">
            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleToggleSave}
                      disabled={isSaving}
                      aria-label={isSaved ? "Unsave job" : "Save job"}
                      className={`brutal-border p-2 hover:bg-muted transition-colors ${
                        isSaved ? "bg-primary text-white" : "bg-card text-foreground"
                      }`}
                    >
                      {isSaving ? (
                        <CircleNotch weight="bold" className="h-5 w-5 animate-spin" />
                      ) : (
                        <BookmarkSimple weight={isSaved ? "fill" : "bold"} className="h-5 w-5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="brutal-border brutal-shadow rounded-none bg-card text-foreground font-bold">
                    <p>{isSaved ? "Unsave" : "Save"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleDismissJob}
                      disabled={isDismissing}
                      aria-label="Dismiss job"
                      className="brutal-border p-2 bg-card text-foreground hover:bg-[#FFEBEB] dark:hover:bg-[#4A1A1A] transition-colors"
                    >
                      {isDismissing ? (
                        <CircleNotch weight="bold" className="h-5 w-5 animate-spin" />
                      ) : (
                        <X weight="bold" className="h-5 w-5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="brutal-border brutal-shadow rounded-none bg-card text-foreground font-bold">
                    <p>Dismiss</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleBlockCompany}
                      disabled={isBlocking}
                      aria-label="Block company"
                      className="brutal-border p-2 bg-card text-foreground hover:bg-foreground hover:text-background transition-colors"
                    >
                      {isBlocking ? (
                        <CircleNotch weight="bold" className="h-5 w-5 animate-spin" />
                      ) : (
                        <ThumbsDown weight="bold" className="h-5 w-5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="brutal-border brutal-shadow rounded-none bg-card text-foreground font-bold">
                    <p>Block Company</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {job.source === "LinkedIn" && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => { e.stopPropagation(); setResumeMatchOpen(true); }}
                        aria-label="Resume match"
                        className="brutal-border p-2 bg-card text-[#7C3AED] hover:bg-[#7C3AED] hover:text-white transition-colors"
                      >
                        <FileText weight="bold" className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="brutal-border brutal-shadow rounded-none bg-card text-foreground font-bold">
                      <p>Resume Match</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="brutal-border bg-[#F15152] text-white px-4 py-2 font-black text-sm flex items-center gap-2 brutal-btn-hover"
            >
              Apply
              <ArrowSquareOut weight="bold" className="h-4 w-4" />
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
      {job.source === "LinkedIn" && (
        <ResumeMatchModal
          job={job}
          open={resumeMatchOpen}
          onOpenChange={setResumeMatchOpen}
        />
      )}
    </>
  );
}
