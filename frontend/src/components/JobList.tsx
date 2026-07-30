"use client";

import { Job, useJobsStore } from "@/store/jobs";
import { JobCard } from "./JobCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Briefcase, Lock, Gear, ArrowRight, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { DsButton, DsCard, Kicker, dsButtonVariants } from "@/components/ds";
import { cn } from "@/lib/utils";

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

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div className={cn("h-3 animate-pulse rounded-[4px] bg-paper-sunk", className)} />
  );
}

function JobCardSkeleton() {
  return (
    <DsCard interactive={false} className="flex h-full flex-col p-4">
      <SkeletonBar className="mb-2.5 w-3/4" />
      <SkeletonBar className="mb-4 w-1/2 opacity-60" />
      <div className="mt-auto flex flex-col gap-2 border-t border-hairline pt-3">
        <SkeletonBar className="w-2/3" />
        <SkeletonBar className="w-1/3" />
      </div>
    </DsCard>
  );
}

function ConfigureLink() {
  return (
    <Link
      href="/settings"
      className={cn(
        dsButtonVariants({ variant: "secondary", size: "sm" }),
        "group gap-2 no-underline"
      )}
    >
      <Gear
        weight="regular"
        className="size-4 shrink-0 text-ink-muted transition-colors group-hover:text-ink"
      />
      <span className="font-mono text-[11px] uppercase tracking-[0.09em]">
        Configure keywords &amp; location
      </span>
      <ArrowRight
        weight="regular"
        className="size-4 shrink-0 text-ink-muted transition-colors group-hover:text-ink"
      />
    </Link>
  );
}

export function JobList({
  jobs,
  emptyMessage = "No jobs yet. We're actively searching — check back in a few minutes.",
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
      <div className="flex flex-col items-center justify-center px-3 py-8 text-center sm:py-24">
        <DsCard
          interactive={false}
          className="w-full max-w-[400px] border-brick p-5 text-left"
        >
          <WarningCircle
            weight="regular"
            className="mb-3 size-8 text-ink-muted sm:size-10"
          />
          <h3 className="mb-2 font-mono text-[13px] uppercase tracking-[0.09em] text-brick">
            Couldn&apos;t load jobs
          </h3>
          <p className="mb-2 break-words font-sans text-[13px] leading-relaxed text-ink-2">
            {error}
          </p>
          <p className="mb-4 font-sans text-[13px] leading-relaxed text-ink-muted">
            Try refreshing or check your connection.
          </p>
          {onRetry && (
            <DsButton variant="danger" size="sm" onClick={onRetry} className="w-full">
              Retry
            </DsButton>
          )}
        </DsCard>
      </div>
    );
  }

  if (displayJobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-3 py-8 text-center sm:py-16">
        <div className="relative mb-4 sm:mb-6">
          <div className="ds-well relative z-10 px-6 py-3">
            <Briefcase weight="regular" className="size-8 text-ink-faint sm:size-12" />
          </div>
          <div className="pointer-events-none absolute inset-[-6px] animate-scan-ring border border-hairline-strong" />
        </div>
        <h3 className="mb-2 max-w-[320px] font-sans text-[15px] leading-snug text-ink-2">
          {emptyMessage}
        </h3>
        <Kicker className="mb-6">Streaming live — new extractions appear automatically</Kicker>
        <ConfigureLink />
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
        <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col items-center justify-center bg-paper/60 p-3 backdrop-blur-[2px] sm:p-0">
          <DsCard
            interactive={false}
            className="flex w-full max-w-[360px] flex-col items-center gap-4 px-8 py-6 text-center"
          >
            <div className="rounded-[4px] bg-brick p-2.5">
              <Lock weight="fill" className="size-7 text-paper-card sm:size-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-serif text-[22px] font-semibold leading-tight text-ink">
                Create an account
              </h3>
              <p className="font-sans text-[13px] leading-relaxed text-ink-muted">
                Sign up free to see all jobs and get real-time alerts.
              </p>
            </div>
            <Link href="/login" className="w-full">
              <DsButton variant="primary" size="md" className="w-full" tabIndex={-1}>
                Get started free
              </DsButton>
            </Link>
          </DsCard>
        </div>
      )}
    </div>
  );
}
