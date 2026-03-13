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
      <MagnifyingGlass weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={locationFilterLocation || "Search location (e.g. MA, California, NYC)"}
        className="brutal-border w-full pl-9 pr-9 py-2.5 text-sm font-bold bg-card shadow-[2px_2px_0px_0px_var(--border)] focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/60"
        disabled={loading}
      />
      {locationFilterLocation && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          title="Clear location"
        >
          <X weight="bold" className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
