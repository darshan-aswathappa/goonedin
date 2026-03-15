import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface MomentumEntry {
  skill: string;
  recent: number;
  prior: number;
  delta: number;
}

export async function GET() {
  try {
    const sb = createServerClient();

    // Fetch completed analyses -- use cache created_at as the canonical timestamp.
    // This avoids the scraped_jobs MIN() deduplication bias where multi-user
    // rows cluster dates toward the earliest scrape.
    const { data: cacheRows, error } = await sb
      .from("job_analysis_cache")
      .select("external_id, analysis, created_at")
      .eq("analysis_status", "completed");

    if (error) throw error;
    if (!cacheRows?.length) {
      return NextResponse.json({ rising: [], declining: [] });
    }

    // Sort rows by created_at so we can split at the median
    const sorted = [...cacheRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    if (sorted.length < 6) {
      return NextResponse.json({ rising: [], declining: [] });
    }

    // Split at the median index -- guarantees ~50/50 job count in each half
    const medianIdx = Math.floor(sorted.length / 2);

    const priorRows = sorted.slice(0, medianIdx);
    const recentRows = sorted.slice(medianIdx);

    const priorCount = priorRows.length;
    const recentCount = recentRows.length;

    // Count keyword frequency in each half
    function countKeywords(rows: NonNullable<typeof cacheRows>): Record<string, number> {
      const freq: Record<string, number> = {};
      for (const row of rows) {
        let analysis = row.analysis;
        while (typeof analysis === "string") {
          try { analysis = JSON.parse(analysis); } catch { break; }
        }
        if (!analysis || typeof analysis !== "object" || !analysis.must_have_keywords) continue;

        for (const kw of analysis.must_have_keywords) {
          const key = kw.trim().toLowerCase();
          if (key.length >= 2) freq[key] = (freq[key] ?? 0) + 1;
        }
      }
      return freq;
    }

    const priorFreq = countKeywords(priorRows);
    const recentFreq = countKeywords(recentRows);

    // Compute normalized delta: rate per 100 jobs in each half
    // This makes the comparison fair even if halves aren't exactly equal
    const allSkills = new Set([...Object.keys(recentFreq), ...Object.keys(priorFreq)]);
    const momentum: MomentumEntry[] = [];

    for (const skill of allSkills) {
      const recentRaw = recentFreq[skill] ?? 0;
      const priorRaw = priorFreq[skill] ?? 0;
      if (recentRaw + priorRaw < 3) continue; // noise filter

      // Normalize to rate per 100 jobs
      const recentRate = (recentRaw / recentCount) * 100;
      const priorRate = (priorRaw / priorCount) * 100;
      const delta = Math.round((recentRate - priorRate) * 10) / 10;

      // Show raw counts in the UI but sort/filter by normalized delta
      momentum.push({
        skill,
        recent: recentRaw,
        prior: priorRaw,
        delta,
      });
    }

    const rising = momentum
      .filter((m) => m.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 10);

    const declining = momentum
      .filter((m) => m.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 10);

    return NextResponse.json({ rising, declining });
  } catch (err) {
    console.error("[analytics/skill-momentum]", err);
    return NextResponse.json(
      { error: "Failed to fetch skill momentum" },
      { status: 500 }
    );
  }
}
