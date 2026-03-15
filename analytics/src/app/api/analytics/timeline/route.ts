import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fillDateRange } from "@/lib/analytics";
import { getBlockedCompanies, isBlocked } from "@/lib/blocked-companies";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const days = Math.min(Math.max(Number(searchParams.get("days")) || 30, 1), 365);
    const source = searchParams.get("source") || "";

    const sb = createServerClient();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffISO = cutoff.toISOString();

    // Query scraped_jobs directly with filters
    let query = sb
      .from("scraped_jobs")
      .select("external_id, posted_at, created_at, source, company")
      .gte("created_at", cutoffISO);

    if (source) {
      query = query.ilike("source", source);
    }

    const [{ data: jobs, error }, blocked] = await Promise.all([
      query,
      getBlockedCompanies(),
    ]);
    if (error) throw error;

    // Deduplicate by external_id, bucket by date, exclude blocked companies
    const seen = new Set<string>();
    const freq: Record<string, number> = {};

    for (const job of jobs ?? []) {
      if (seen.has(job.external_id)) continue;
      seen.add(job.external_id);

      // Skip blocked companies
      if (job.company && isBlocked(job.company, blocked)) continue;

      const dateStr = job.posted_at?.slice(0, 10) || job.created_at?.slice(0, 10);
      if (dateStr) {
        freq[dateStr] = (freq[dateStr] ?? 0) + 1;
      }
    }

    const raw = Object.entries(freq).map(([day, count]) => ({ day, count }));
    const timeline = fillDateRange(raw, days);

    return NextResponse.json({ timeline });
  } catch (err) {
    console.error("[analytics/timeline]", err);
    return NextResponse.json({ error: "Failed to fetch timeline" }, { status: 500 });
  }
}
