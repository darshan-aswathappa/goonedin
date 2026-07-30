"use client";

import { useState } from "react";
import { useJobsStore } from "@/store/jobs";
import { getAuthHeaders } from "@/hooks/useAuth";
import { toast } from "sonner";
import { MagnifyingGlass, X, CircleNotch } from "@phosphor-icons/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const LOCATION_MAX = 120;

export function LocationFilterInput() {
  const locationFilterLocation = useJobsStore((s) => s.locationFilterLocation);
  const setLocationFilter = useJobsStore((s) => s.setLocationFilter);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim().slice(0, LOCATION_MAX);
    if (!value || loading) return;

    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      let res: Response;
      try {
        res = await fetch(`${API_URL}/config/location-filter`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ location: value }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        if (res.status === 401) {
          toast.error("Please sign in again");
        } else {
          toast.error(err.detail || "Invalid location");
        }
        return;
      }

      const data = await res.json();
      setLocationFilter(data.location, data.normalized);
      setInput("");
      toast.success(`Location set to ${data.normalized?.full_name || value}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("Request timed out. Try again.");
      } else {
        toast.error("Failed to update location");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      let res: Response;
      try {
        res = await fetch(`${API_URL}/config/location-filter`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ location: null }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (res.ok) {
        setLocationFilter(null, null);
        setInput("");
        toast.success("Location filter cleared");
      } else if (res.status === 401) {
        toast.error("Please sign in again");
      } else {
        toast.error("Couldn't clear location filter");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("Request timed out. Try again.");
      } else {
        toast.error("Failed to clear location");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full min-w-0 sm:w-64">
      <MagnifyingGlass
        weight="regular"
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted sm:left-3"
        aria-hidden
      />
      <input
        type="text"
        value={input}
        maxLength={LOCATION_MAX}
        onChange={(e) => setInput(e.target.value.slice(0, LOCATION_MAX))}
        placeholder={locationFilterLocation || "Location"}
        title="Search location (e.g., CA, Massachusetts, NYC, 10001)"
        aria-label="Filter jobs by location"
        className="location-input h-11 w-full min-w-0 rounded-[4px] border border-hairline bg-paper-card pl-8 pr-10 font-mono text-[16px] text-ink outline-none transition-colors duration-[120ms] placeholder:text-ink-faint focus:border-brick disabled:opacity-50 sm:h-10 sm:pl-9 sm:pr-9 sm:text-[15px]"
        disabled={loading}
      />
      {loading ? (
        <CircleNotch
          weight="regular"
          className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-muted sm:right-2.5"
          aria-hidden
        />
      ) : locationFilterLocation ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-[4px] text-ink-muted transition-colors duration-[120ms] hover:text-brick sm:right-1.5 sm:size-8"
          title="Clear location"
          aria-label="Clear location filter"
        >
          <X weight="regular" className="size-4" />
        </button>
      ) : null}
    </form>
  );
}
