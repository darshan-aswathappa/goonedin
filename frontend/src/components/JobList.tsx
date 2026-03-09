"use client";

import { Job, useJobsStore } from "@/store/jobs";
import { JobCard } from "./JobCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Briefcase, 
  Lock, 
  CircleNotch,
  WarningCircle 
} from "@phosphor-icons/react";
import Link from "next/link";

interface JobListProps {
  jobs: Job[];
  emptyMessage?: string;
  isLocked?: boolean;
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
      <div className="pt-4 border-t-2 border-black dark:border-white space-y-2 mt-auto">
        <div className="h-4 w-2/3 animate-pulse bg-muted brutal-border" />
        <div className="h-4 w-1/3 animate-pulse bg-muted brutal-border" />
      </div>
    </div>
  );
}

export function JobList({ 
  jobs, 
  emptyMessage = "No jobs yet. Waiting for new opportunities...",
  isLocked = false
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

  if (displayJobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="brutal-border bg-card p-6 shadow-[4px_4px_0px_0px_var(--border)] mb-6">
          <Briefcase weight="bold" className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-2xl font-black uppercase italic tracking-tighter mb-2">
          {emptyMessage}
        </h3>
        <p className="font-bold text-muted-foreground">
          New jobs will appear here in real-time.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className={isLocked ? "pointer-events-none" : ""}>
        <ScrollArea className={`${isLocked ? "h-[600px] overflow-hidden" : "h-[calc(100vh-220px)]"} pr-4 pb-8`}>
          <div className="job-card-grid">
            {displayJobs.map((job, index) => (
              <div 
                key={job.external_id}
                className={`h-full ${isLocked && index >= 3 ? "blur-[2px] opacity-40" : ""}`}
              >
                <JobCard job={job} isLocked={isLocked} />
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {isLocked && (
        <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col items-center justify-center bg-background/20 backdrop-blur-[2px]">
          <div className="brutal-border bg-card p-10 shadow-[8px_8px_0px_0px_var(--border)] flex flex-col items-center gap-6 max-w-md text-center">
            <div className="brutal-border bg-primary p-4 shadow-[4px_4px_0px_0px_var(--border)]">
              <Lock weight="fill" className="h-10 w-10 text-white" />
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-black uppercase italic tracking-tighter">
                Access Denied
              </h3>
              <p className="font-bold text-muted-foreground leading-tight">
                Create an account to unlock exclusive job postings and real-time alerts.
              </p>
            </div>
            <Link href="/login" className="w-full">
              <button className="w-full brutal-border bg-primary text-white py-4 font-black uppercase italic text-xl brutal-btn-hover">
                Sign In Now
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
