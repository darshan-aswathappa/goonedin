import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = createServerClient();

    // Query all completed analyses
    const { data: cacheRows, error } = await sb
      .from("job_analysis_cache")
      .select("external_id, analysis")
      .eq("analysis_status", "completed")
      .limit(50000);

    if (error) throw error;

    // Extract years-of-experience from minimum_qualifications
    const buckets: Record<string, number> = {
      "0\u20132 yr": 0,
      "2\u20134 yr": 0,
      "4\u20136 yr": 0,
      "6\u20138 yr": 0,
      "8+ yr": 0,
    };

    let matched = 0;

    for (const row of cacheRows ?? []) {
      // Handle double-encoded JSON (JSONB column storing a JSON string)
      let analysis = row.analysis;
      while (typeof analysis === "string") {
        try { analysis = JSON.parse(analysis); } catch { break; }
      }
      if (!analysis || typeof analysis !== "object" || !analysis.minimum_qualifications) continue;

      // Check all qualifications for year patterns
      let bestYears: number | null = null;
      for (const qual of analysis.minimum_qualifications) {
        const q = qual.toLowerCase();
        // Match patterns like "3-5 years", "3 to 5 years"
        const rangeMatch = q.match(/(\d+)\s*(?:to|-|\u2013)\s*(\d+)\s*(?:\+?\s*)?year/i);
        // Match patterns like "3+ years", "3 years"
        const plusMatch = q.match(/(\d+)\s*\+?\s*year/i);

        if (rangeMatch) {
          const avg = (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2;
          if (avg > 0 && avg <= 20)
            bestYears = bestYears !== null ? Math.max(bestYears, avg) : avg;
        } else if (plusMatch) {
          const val = parseInt(plusMatch[1]);
          if (val > 0 && val <= 20)
            bestYears = bestYears !== null ? Math.max(bestYears, val) : val;
        }
      }

      if (bestYears !== null) {
        matched++;
        if (bestYears < 2) buckets["0\u20132 yr"]++;
        else if (bestYears < 4) buckets["2\u20134 yr"]++;
        else if (bestYears < 6) buckets["4\u20136 yr"]++;
        else if (bestYears < 8) buckets["6\u20138 yr"]++;
        else buckets["8+ yr"]++;
      }
    }

    const total = cacheRows?.length ?? 0;
    const distribution = Object.entries(buckets).map(([label, count]) => ({ label, count }));

    return NextResponse.json({
      distribution,
      matched,
      total,
      matchRate: total > 0 ? Math.round((matched / total) * 100) : 0,
    });
  } catch (err) {
    console.error("[analytics/experience]", err);
    return NextResponse.json({ error: "Failed to fetch experience data" }, { status: 500 });
  }
}
