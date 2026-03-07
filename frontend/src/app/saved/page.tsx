"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CaretLeft, BookmarkSimple, CircleNotch } from "@phosphor-icons/react";
import { Job, useJobsStore } from "@/store/jobs";
import { JobList } from "@/components/JobList";
import { getAuthHeaders } from "@/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SavedJobsPage() {
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const storeSavedJobIds = useJobsStore((state) => state.savedJobIds);
  const setSavedJobIds = useJobsStore((state) => state.setSavedJobIds);

  const fetchSavedJobs = async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/jobs/saved`, { headers });
      if (response.ok) {
        const data = await response.json();
        const jobs: Job[] = data.jobs || [];
        setSavedJobs(jobs);
        setSavedJobIds(jobs.map(j => j.external_id));
      }
    } catch (error) {
      console.error("Failed to fetch saved jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSavedJobs();
  }, []);

  const displayJobs = savedJobs.filter((job) => storeSavedJobIds.has(job.external_id));

  return (
    <div className="min-h-screen bg-background p-6 text-foreground transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-10">
          <Link
            href="/"
            className="brutal-border flex h-10 w-10 items-center justify-center bg-card hover:bg-muted transition-colors shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            title="Back to Dashboard"
          >
            <CaretLeft weight="bold" className="h-6 w-6" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="brutal-border bg-primary p-2 shadow-[2px_2px_0px_0px_var(--border)]">
              <BookmarkSimple weight="fill" className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Saved Jobs</h1>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-24">
            <CircleNotch weight="bold" className="h-12 w-12 animate-spin text-[#F15152]" />
          </div>
        ) : (
          <JobList 
            jobs={displayJobs} 
            emptyMessage="Zero saves. Go bookmark some jobs!" 
          />
        )}
      </div>
    </div>
  );
}
