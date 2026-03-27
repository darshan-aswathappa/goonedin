import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { aggregateSalary } from "@/lib/analytics";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

// City normalization - map location strings to city buckets
function classifyCity(location: string | null): string | null {
  if (!location) return null;
  const lower = location.toLowerCase();

  if (lower.includes("remote") && !lower.includes(",")) return "Remote";
  if (lower.includes("san francisco") || lower === "sf") return "San Francisco, CA";
  if (lower.includes("new york") || lower === "nyc") return "New York, NY";
  if (lower.includes("seattle")) return "Seattle, WA";
  if (lower.includes("austin")) return "Austin, TX";
  if (lower.includes("boston")) return "Boston, MA";
  if (lower.includes("los angeles") || lower === "la") return "Los Angeles, CA";
  if (lower.includes("chicago")) return "Chicago, IL";
  if (lower.includes("denver")) return "Denver, CO";
  if (lower.includes("washington") || lower === "dc") return "Washington, DC";
  if (
    lower.includes("san jose") ||
    lower.includes("palo alto") ||
    lower.includes("mountain view") ||
    lower.includes("menlo park") ||
    lower.includes("sunnyvale") ||
    lower.includes("cupertino")
  )
    return "Bay Area (South), CA";
  if (lower.includes("atlanta")) return "Atlanta, GA";
  return null; // Skip cities with too few data points
}

export async function GET() {
  try {
    const sb = createServerClient();

    // Fetch all jobs with salary and location
    const { data: rows, error } = await sb
      .from("scraped_jobs")
      .select("external_id, salary, location, created_at")
      .not("salary", "is", null);

    if (error) throw error;

    // Deduplicate by external_id (keep earliest)
    const seen = new Map<string, (typeof rows)[0]>();
    const sorted = [...(rows ?? [])].sort((a, b) =>
      (a.created_at ?? "9999") < (b.created_at ?? "9999") ? -1 : 1
    );
    for (const row of sorted) {
      if (!seen.has(row.external_id)) seen.set(row.external_id, row);
    }

    // Group by city bucket
    const cityGroups: Record<string, { external_id: string; salary: string }[]> = {};
    for (const row of seen.values()) {
      const city = classifyCity(row.location);
      if (!city || !row.salary) continue;
      if (!cityGroups[city]) cityGroups[city] = [];
      cityGroups[city].push({ external_id: row.external_id, salary: row.salary });
    }

    // Run aggregateSalary per city, filter to cities with >= 3 salary data points
    const cityData: { city: string; median: number; count: number; listedRate: number }[] = [];
    for (const [city, salaryRows] of Object.entries(cityGroups)) {
      const result = aggregateSalary(salaryRows);
      if (result.medianEstimate && result.listedCount >= 3) {
        cityData.push({
          city,
          median: result.medianEstimate,
          count: result.listedCount,
          listedRate: result.listedRate,
        });
      }
    }

    // Sort by median salary descending
    cityData.sort((a, b) => b.median - a.median);

    return NextResponse.json({ cities: cityData });
  } catch (err) {
    console.error("[analytics/salary-by-location]", err);
    return NextResponse.json({ error: "Failed to fetch salary by location" }, { status: 500 });
  }
}
