"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookmarkSimple, CircleNotch, ArrowLeft } from "@phosphor-icons/react";
import { Job, useJobsStore } from "@/store/jobs";
import { JobList } from "@/components/JobList";
import { getAuthHeaders } from "@/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SavedJobsPage() {
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [backHovered, setBackHovered] = useState(false);
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
    <div style={{ minHeight: "100vh", background: "#000000" }}>
      <header
        style={{
          height: "44px",
          background: "#060606",
          borderBottom: "1px solid #1c1c1c",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/">
            <div
              onMouseEnter={() => setBackHovered(true)}
              onMouseLeave={() => setBackHovered(false)}
              style={{
                width: "28px",
                height: "28px",
                border: backHovered ? "1px solid #ff8c00" : "1px solid #1c1c1c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: backHovered ? "#ff8c00" : "#555555",
                cursor: "pointer",
                transition: "border-color 0.1s, color 0.1s",
              }}
            >
              <ArrowLeft style={{ width: "14px", height: "14px" }} />
            </div>
          </Link>
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.2em",
                color: "#ff8c00",
                textTransform: "uppercase",
              }}
            >
              SAVED JOBS
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.12em",
                color: "#555555",
                marginTop: "1px",
              }}
            >
              YOUR PERSONAL CAREER SHORTLIST
            </div>
          </div>
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "#ffd700",
            border: "1px solid rgba(255,215,0,0.3)",
            padding: "3px 10px",
            letterSpacing: "0.1em",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <BookmarkSimple
            weight="fill"
            style={{ width: "12px", height: "12px" }}
          />
          <span>{displayJobs.length} SAVED</span>
        </div>
      </header>

      <main style={{ padding: "16px" }}>
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "60px 0",
            }}
          >
            <CircleNotch
              weight="bold"
              style={{
                width: "32px",
                height: "32px",
                color: "#ff8c00",
                animation: "spin 1s linear infinite",
              }}
              className="animate-spin"
            />
          </div>
        ) : (
          <JobList
            jobs={displayJobs}
            emptyMessage="Zero saves. Go bookmark some jobs!"
          />
        )}
      </main>
    </div>
  );
}
