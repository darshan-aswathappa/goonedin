"use client";

import { useCallback, useEffect, useRef } from "react";
import { useJobsStore, Job } from "@/store/jobs";
import { getAuthHeaders } from "@/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const REFRESH_INTERVAL = 30000;

export function useJobsApi(enabled: boolean = true) {
  const { setJobs, setLoading, setSavedJobIds, setLocationFilter, setApiError } = useJobsStore();
  const connectionStatus = useJobsStore((state) => state.connectionStatus);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevStatusRef = useRef(connectionStatus);

  const fetchJobs = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let jobsRes: Response, savedRes: Response, customRes: Response, locationRes: Response;
      try {
        [jobsRes, savedRes, customRes, locationRes] = await Promise.all([
          fetch(`${API_URL}/jobs`, { headers, signal: controller.signal }),
          fetch(`${API_URL}/jobs/saved`, { headers, signal: controller.signal }),
          fetch(`${API_URL}/config/custom-sources`, { headers, signal: controller.signal }),
          fetch(`${API_URL}/config/location-filter`, { headers, signal: controller.signal }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }

      if (!jobsRes.ok) {
        let errorMsg = "Failed to load jobs";
        if (jobsRes.status === 401) {
          errorMsg = "Please sign in again";
        } else if (jobsRes.status === 403) {
          errorMsg = "You don't have permission to view these jobs.";
        } else if (jobsRes.status === 429) {
          errorMsg = "Too many requests. Please try again in a moment.";
        } else if (jobsRes.status >= 500) {
          errorMsg = "Server error. Our team is investigating.";
        }
        setApiError(errorMsg);
        setLoading(false);
        return;
      }

      const data = await jobsRes.json();
      const savedData = savedRes.ok ? await savedRes.json() : { jobs: [] };
      const customData = customRes.ok ? await customRes.json() : { custom_sources: [] };
      const locationData = locationRes.ok ? await locationRes.json() : { location: null, normalized: null };

      const jobs: Job[] = data.jobs || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const savedIds: string[] = (savedData.jobs || []).map((j: any) => j.external_id);

      setLocationFilter(locationData.location, locationData.normalized);
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
      setApiError(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setApiError("Request timed out. Check your connection and try again.");
      } else if (error instanceof TypeError) {
        setApiError("Network error. Check your connection.");
      } else {
        setApiError("Failed to load jobs. Please try again.");
      }
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  }, [setJobs, setLoading, setSavedJobIds, setLocationFilter, setApiError]);

  useEffect(() => {
    if (!enabled) return;
    
    fetchJobs();
    intervalRef.current = setInterval(fetchJobs, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchJobs, enabled]);

  // Refetch when WebSocket reconnects, but use a small delay to avoid rapid refetches
  // This ensures jobs stay visible during brief disconnects
  useEffect(() => {
    if (!enabled) return;

    if (connectionStatus === "connected" && prevStatusRef.current === "disconnected") {
      // Small delay (100ms) to debounce rapid reconnects
      const timer = setTimeout(fetchJobs, 100);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = connectionStatus;
  }, [connectionStatus, fetchJobs, enabled]);

  return { refetch: fetchJobs };
}
