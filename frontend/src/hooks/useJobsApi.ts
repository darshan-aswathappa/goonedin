"use client";

import { useCallback, useEffect, useRef } from "react";
import { useJobsStore, Job } from "@/store/jobs";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const REFRESH_INTERVAL = 30000; // 30 seconds

export function useJobsApi() {
  const { setJobs, setLoading } = useJobsStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/jobs`);
      if (!response.ok) throw new Error("Failed to fetch jobs");
      
      const data = await response.json();
      const jobs: Job[] = data.jobs || [];
      setJobs(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  }, [setJobs, setLoading]);

  useEffect(() => {
    fetchJobs();

    intervalRef.current = setInterval(fetchJobs, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchJobs]);

  return { refetch: fetchJobs };
}
