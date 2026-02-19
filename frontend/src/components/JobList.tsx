"use client";

import { Job } from "@/store/jobs";
import { JobCard } from "./JobCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Briefcase } from "lucide-react";

interface JobListProps {
  jobs: Job[];
  emptyMessage?: string;
}

export function JobList({ jobs, emptyMessage = "No jobs yet. Waiting for new opportunities..." }: JobListProps) {
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
