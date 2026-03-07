"use client";

import { Job, useJobsStore } from "@/store/jobs";
import { JobCard } from "./JobCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Briefcase, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    external_id: "dummy-2",
    title: "Quantitative Analyst",
    company: "Fidelity",
    location: "Boston, MA",
    url: "#",
    source: "Fidelity",
    is_new: false,
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
    external_id: "dummy-4",
    title: "Data Scientist",
    company: "State Street",
    location: "Boston, MA",
    url: "#",
    source: "StateStreet",
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
    <Card className="overflow-hidden border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-5 w-20 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="h-10 w-full animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
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
      <div className="grid gap-4 pb-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (displayJobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted/50 p-4 mb-4">
          <Briefcase className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium text-muted-foreground">
          {emptyMessage}
        </p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          New jobs will appear here in real-time
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {isLocked ? (
        <div className="pr-4 pb-4 overflow-hidden pt-2 pointer-events-none">
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {displayJobs.map((job, index) => (
              <div 
                key={job.external_id} 
                className={index >= 3 ? "blur-sm opacity-50 select-none transition-all duration-300" : ""}
              >
                <JobCard job={job} isLocked={isLocked} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-220px)] pr-4">
          <div className="grid gap-4 pb-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {displayJobs.map((job) => (
              <div key={job.external_id}>
                <JobCard job={job} />
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {isLocked && (
        <div className="absolute bottom-0 left-0 right-4 flex h-[350px] flex-col items-center justify-end bg-gradient-to-t from-background/95 via-background/80 to-transparent pb-10 pt-20 pointer-events-none">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-border/40 bg-card/95 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:shadow-primary/5 pointer-events-auto">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 shadow-inner">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="font-bold text-xl tracking-tight">Sign in to view all jobs</h3>
              <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">
                Create a free account to unlock exclusive job postings, personalized alerts, and more.
              </p>
            </div>
            <Link href="/login" className="mt-4 w-full">
              <Button className="w-full h-11 font-medium shadow-sm transition-transform hover:scale-[1.02]" size="lg">
                See all jobs
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
