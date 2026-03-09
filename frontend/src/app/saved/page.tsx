"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CaretLeft, BookmarkSimple, CircleNotch, ArrowLeft } from "@phosphor-icons/react";
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
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="brutal-border flex h-10 w-10 items-center justify-center bg-card hover:bg-muted transition-all shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              title="Back to Dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter leading-none">
                Saved Jobs
              </h1>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                Your personal career shortlist
              </p>
            </div>
          </div>
          
          <div className="brutal-border bg-card px-4 py-2 shadow-[4px_4px_0px_0px_var(--border)] flex items-center gap-2">
            <BookmarkSimple weight="fill" className="h-5 w-5 text-[#009063]" />
            <span className="font-black text-sm uppercase tracking-tighter">
              {displayJobs.length} Saved
            </span>
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
