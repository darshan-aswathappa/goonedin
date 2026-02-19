"use client";

import { Job, useJobsStore } from "@/store/jobs";
import { JobCard } from "./JobCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Briefcase, Loader2 } from "lucide-react";

interface JobListProps {
  jobs: Job[];
  emptyMessage?: string;
}

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

export function JobList({ jobs, emptyMessage = "No jobs yet. Waiting for new opportunities..." }: JobListProps) {
  const isLoading = useJobsStore((state) => state.isLoading);

  if (isLoading) {
    return (
      <div className="grid gap-4 pb-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
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
    <ScrollArea className="h-[calc(100vh-220px)] pr-4">
      <div className="grid gap-4 pb-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <JobCard key={job.external_id} job={job} />
        ))}
      </div>
    </ScrollArea>
  );
}
