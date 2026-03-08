"use client";

import { useCallback, useEffect, useRef } from "react";
import { useJobsStore, Job } from "@/store/jobs";
import { getAuthHeaders } from "@/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const REFRESH_INTERVAL = 30000;

export function useJobsApi(enabled: boolean = true) {
  const { setJobs, setLoading, setSavedJobIds } = useJobsStore();
  const connectionStatus = useJobsStore((state) => state.connectionStatus);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevStatusRef = useRef(connectionStatus);

  const fetchJobs = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const [jobsRes, savedRes, customRes] = await Promise.all([
        fetch(`${API_URL}/jobs`, { headers }),
        fetch(`${API_URL}/jobs/saved`, { headers }),
        fetch(`${API_URL}/config/custom-sources`, { headers }),
      ]);
      
      if (!jobsRes.ok) throw new Error(`HTTP ${jobsRes.status}`);

      const data = await jobsRes.json();
      const savedData = savedRes.ok ? await savedRes.json() : { jobs: [] };
      const customData = customRes.ok ? await customRes.json() : { custom_sources: [] };

      const jobs: Job[] = data.jobs || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const savedIds: string[] = (savedData.jobs || []).map((j: any) => j.external_id);

      setJobs(jobs);
      setSavedJobIds(savedIds);
      const customSourcesList = customData.custom_sources || [];
      useJobsStore.getState().setCustomSources(customSourcesList);
      // Seed source statuses from initial API response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const src of customSourcesList as any[]) {
        if (src.status && src.status !== "done") {
          useJobsStore.getState().setSourceStatus(
            src.id,
            src.status,
            src.status_message || ""
          );
        }
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  }, [setJobs, setLoading, setSavedJobIds]);

  useEffect(() => {
    if (!enabled) return;
    
    fetchJobs();
    intervalRef.current = setInterval(fetchJobs, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchJobs, enabled]);

  // Refetch immediately when WebSocket reconnects after a disconnect
  useEffect(() => {
    if (!enabled) return;
    
    if (connectionStatus === "connected" && prevStatusRef.current === "disconnected") {
      fetchJobs();
    }
    prevStatusRef.current = connectionStatus;
  }, [connectionStatus, fetchJobs, enabled]);

  return { refetch: fetchJobs };
}
