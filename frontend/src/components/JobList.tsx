"use client";

import { Job, useJobsStore } from "@/store/jobs";
import { JobCard } from "./JobCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Briefcase, Lock, Gear, ArrowRight, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";

interface JobListProps {
  jobs: Job[];
  emptyMessage?: string;
  isLocked?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const DUMMY_JOBS: Job[] = [
  {
    external_id: "dummy-1",
    title: "Software Engineer, Machine Learning",
    company: "GitHub",
    location: "San Francisco, CA",
    url: "#",
    source: "GitHub",
    is_new: true,
  },
  {
    external_id: "dummy-3",
    title: "Senior Backend Developer",
    company: "LinkedIn",
    location: "Sunnyvale, CA",
    url: "#",
    source: "LinkedIn",
    is_new: false,
  },
  {
    external_id: "dummy-5",
    title: "Full Stack Engineer",
    company: "MathWorks",
    location: "Natick, MA",
    url: "#",
    source: "MathWorks",
    is_new: false,
  },
  {
    external_id: "dummy-6",
    title: "Frontend Developer",
    company: "GitHub",
    location: "Remote",
    url: "#",
    source: "GitHub",
    is_new: false,
  },
];

function JobCardSkeleton() {
  return (
    <div className="brutal-border bg-card p-6 shadow-[4px_4px_0px_0px_var(--border)] space-y-4 h-full flex flex-col">
      <div className="h-6 w-3/4 animate-pulse bg-muted brutal-border" />
      <div className="h-4 w-1/2 animate-pulse bg-muted brutal-border opacity-50" />
      <div className="pt-4 border-t-2 border-border space-y-2 mt-auto">
        <div className="h-4 w-2/3 animate-pulse bg-muted brutal-border" />
        <div className="h-4 w-1/3 animate-pulse bg-muted brutal-border" />
      </div>
    </div>
  );
}

export function JobList({
  jobs,
  emptyMessage = "No jobs yet. We're actively searching—check back in a few minutes!",
  isLocked = false,
  error,
  onRetry,
}: JobListProps) {
  const isLoading = useJobsStore((state) => state.isLoading);
  const displayJobs = isLocked ? DUMMY_JOBS : jobs;

  if (isLoading && !isLocked) {
    return (
      <div className="job-card-grid pb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error && !isLocked) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-24 px-3 text-center">
        <div className="brutal-border bg-red-50 dark:bg-red-950/30 p-3 sm:p-6 shadow-[2px_2px_0px_0px_var(--border)] sm:shadow-[4px_4px_0px_0px_var(--border)] mb-4 sm:mb-6 border-red-500 max-w-md w-full">
          <WarningCircle weight="bold" className="h-8 w-8 sm:h-10 sm:w-10 text-red-500 mb-2 sm:mb-4" />
          <h3 className="text-lg sm:text-2xl font-black uppercase italic tracking-tighter mb-2 text-red-700 dark:text-red-400">
            Couldn&apos;t Load Jobs
          </h3>
          <p className="font-bold text-muted-foreground mb-2 break-words text-xs sm:text-sm">
            {error}
          </p>
          <p className="font-bold text-muted-foreground mb-4 sm:mb-6 text-xs sm:text-sm">Try refreshing or check your connection.</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="brutal-border px-4 sm:px-6 py-2 sm:py-3 font-bold text-sm sm:text-base bg-red-600 text-white hover:bg-red-700 transition-colors w-full"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (displayJobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-16 px-3 text-center">
        <div className="relative mb-4 sm:mb-6">
          <div className="brutal-border bg-card p-3 sm:p-6 shadow-[2px_2px_0px_0px_var(--border)] sm:shadow-[4px_4px_0px_0px_var(--border)] relative z-10">
            <Briefcase weight="bold" className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground" />
          </div>
          <div className="absolute inset-[-6px] border-2 border-primary/40 animate-scan-ring pointer-events-none" />
        </div>
        <h3 className="text-base sm:text-2xl font-black uppercase italic tracking-tighter mb-1 sm:mb-2 max-w-xs">
          {emptyMessage}
        </h3>
        <p className="font-bold text-muted-foreground text-xs sm:text-sm mb-6">
          Streaming live — new extractions appear automatically.
        </p>
        <Link href="/settings">
          <div className="brutal-border bg-card px-4 py-2.5 shadow-[2px_2px_0px_0px_var(--border)] brutal-btn-hover flex items-center gap-2">
            <Gear weight="bold" className="h-4 w-4 text-primary" />
            <span className="font-black uppercase italic text-sm tracking-tight">Configure keywords &amp; location</span>
            <ArrowRight weight="bold" className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className={isLocked ? "pointer-events-none" : ""}>
        <ScrollArea className={`${isLocked ? "h-[500px] sm:h-[600px] overflow-hidden" : "h-[calc(100dvh-200px)] sm:h-[calc(100dvh-220px)]"} pr-3 sm:pr-4 pb-6 sm:pb-8`}>
          <div className="job-card-grid">
            {displayJobs.map((job, index) => (
              <div
                key={job.external_id}
                className={`h-full animate-job-enter ${isLocked && index >= 3 ? "blur-[2px] opacity-40" : ""}`}
                style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
              >
                <JobCard job={job} isLocked={isLocked} />
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {isLocked && (
        <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col items-center justify-center bg-background/20 backdrop-blur-[2px] p-3 sm:p-0">
          <div className="brutal-border bg-card p-4 sm:p-10 shadow-[4px_4px_0px_0px_var(--border)] sm:shadow-[8px_8px_0px_0px_var(--border)] flex flex-col items-center gap-3 sm:gap-6 max-w-sm text-center w-full">
            <div className="brutal-border bg-primary p-3 sm:p-4 shadow-[2px_2px_0px_0px_var(--border)] sm:shadow-[4px_4px_0px_0px_var(--border)]">
              <Lock weight="fill" className="h-7 w-7 sm:h-10 sm:w-10 text-white" />
            </div>
            <div className="space-y-1 sm:space-y-2">
              <h3 className="text-lg sm:text-3xl font-black uppercase italic tracking-tighter leading-tight">
                Create an Account
              </h3>
              <p className="font-bold text-muted-foreground leading-tight text-xs sm:text-base">
                Sign up free to see all jobs and get real-time alerts.
              </p>
            </div>
            <Link href="/login" className="w-full">
              <button className="w-full brutal-border bg-primary text-white py-2.5 sm:py-4 font-black uppercase italic text-sm sm:text-xl brutal-btn-hover">
                Get Started Free
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
