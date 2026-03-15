import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { normalizeLocation } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_locations");
    if (error) throw error;

    // Country-level entries to exclude (we only scrape US jobs, so these are noise)
    const COUNTRY_FILTER = new Set([
      "united states", "usa", "us", "u.s.", "u.s.a.", "america",
      "canada", "united kingdom", "uk", "india", "germany", "worldwide",
    ]);

    // Normalize and merge city aliases
    const freq: Record<string, number> = {};
    for (const row of data as { location: string; count: number }[]) {
      const city = normalizeLocation(row.location);
      if (!city || city.length < 2) continue;
      if (COUNTRY_FILTER.has(city.toLowerCase())) continue;
      freq[city] = (freq[city] ?? 0) + Number(row.count);
    }

    const locations = Object.entries(freq)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ locations });
  } catch (err) {
    console.error("[analytics/locations]", err);
    return NextResponse.json({ error: "Failed to fetch locations" }, { status: 500 });
  }
}
