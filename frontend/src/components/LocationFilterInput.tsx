"use client";

import { useState } from "react";
import { useJobsStore } from "@/store/jobs";
import { getAuthHeaders } from "@/hooks/useAuth";
import { toast } from "sonner";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function LocationFilterInput() {
  const locationFilterLocation = useJobsStore((s) => s.locationFilterLocation);
  const setLocationFilter = useJobsStore((s) => s.setLocationFilter);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) return;

    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/config/location-filter`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ location: value }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        toast.error(err.detail || "Invalid location");
        return;
      }

      const data = await res.json();
      setLocationFilter(data.location, data.normalized);
      setInput("");
      toast.success(`Location set to ${data.normalized?.full_name || value}`);
    } catch {
      toast.error("Failed to update location");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/config/location-filter`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ location: null }),
      });

      if (res.ok) {
        setLocationFilter(null, null);
        setInput("");
        toast.success("Location filter cleared");
      }
    } catch {
      toast.error("Failed to clear location");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full sm:w-64">
      <MagnifyingGlass
        weight="regular"
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted sm:left-3"
      />
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={locationFilterLocation || "Location"}
        title="Search location (e.g., CA, Massachusetts, NYC, 10001)"
        className="location-input h-9 w-full rounded-[4px] border border-hairline bg-paper-card pl-8 pr-8 font-mono text-[13px] text-ink outline-none transition-colors duration-[120ms] placeholder:text-ink-faint focus:border-brick disabled:opacity-50 sm:h-10 sm:pl-9 sm:pr-9 sm:text-[15px]"
        disabled={loading}
      />
      {locationFilterLocation && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[4px] p-0.5 text-ink-muted transition-colors duration-[120ms] hover:text-brick sm:right-2.5"
          title="Clear location"
        >
          <X weight="regular" className="size-4" />
        </button>
      )}
    </form>
  );
}
