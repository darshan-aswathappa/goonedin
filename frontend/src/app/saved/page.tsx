"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookmarkSimple, CircleNotch, ArrowLeft } from "@phosphor-icons/react";
import { Job, useJobsStore } from "@/store/jobs";
import { JobList } from "@/components/JobList";
import { getAuthHeaders } from "@/hooks/useAuth";
import { Kicker } from "@/components/ds";

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
        setSavedJobIds(jobs.map((j) => j.external_id));
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

  const displayJobs = savedJobs.filter((job) =>
    storeSavedJobIds.has(job.external_id)
  );

  return (
    <div className="min-h-dvh bg-paper">
      <header className="shell-header bg-paper-card">
        <div className="shell-header-inner">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              aria-label="Back to feed"
              className="shell-back"
            >
              <ArrowLeft className="size-[14px]" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-serif text-[19px] font-semibold leading-none text-ink">
                Saved
              </h1>
              <Kicker className="mt-1">Your shortlist</Kicker>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 rounded-[4px] border border-hairline bg-paper-card px-3 py-1.5">
            <BookmarkSimple weight="fill" className="size-3 text-ink-muted" />
            <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-2">
              {displayJobs.length} saved
            </span>
          </div>
        </div>
      </header>

      <main className="shell-main mx-auto w-full max-w-[1400px]">
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <CircleNotch className="size-7 animate-spin text-brick" />
            <Kicker>Loading saved jobs</Kicker>
          </div>
        ) : (
          <JobList
            jobs={displayJobs}
            emptyMessage="No saved jobs yet. Bookmark a posting to keep it here."
          />
        )}
      </main>
    </div>
  );
}
