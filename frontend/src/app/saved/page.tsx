"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Bookmark } from "lucide-react";
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
        
        // Make sure store is synchronized just in case
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
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-primary fill-primary/20" />
            <h1 className="text-xl font-bold tracking-tight">Saved Jobs</h1>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <JobList 
            jobs={displayJobs} 
            emptyMessage="You haven't saved any jobs yet. Bookmark jobs from the feed to see them here." 
          />
        )}
      </div>
    </div>
  );
}
