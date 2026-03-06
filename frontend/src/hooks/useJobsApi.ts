"use client";

import { useCallback, useEffect, useRef } from "react";
import { useJobsStore, Job } from "@/store/jobs";
import { getAuthHeaders } from "@/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const REFRESH_INTERVAL = 30000;

export function useJobsApi() {
  const { setJobs, setLoading } = useJobsStore();
  const connectionStatus = useJobsStore((state) => state.connectionStatus);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevStatusRef = useRef(connectionStatus);

  const fetchJobs = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/jobs`, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchJobs]);

  // Refetch immediately when WebSocket reconnects after a disconnect
  useEffect(() => {
    if (connectionStatus === "connected" && prevStatusRef.current === "disconnected") {
      fetchJobs();
    }
    prevStatusRef.current = connectionStatus;
  }, [connectionStatus, fetchJobs]);

  return { refetch: fetchJobs };
}
