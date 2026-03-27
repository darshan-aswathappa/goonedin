import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

// All aggregation happens in Postgres via analytics_skill_momentum() RPC.
// This covers ALL rows with no cap — previously limited to 50,000 raw rows
// transferred to Node.js for JS-side processing. Now Postgres returns ~200
// aggregated rows. Apply supabase/skill_momentum_rpc.sql to enable this.
export async function GET() {
  try {
    const sb = createServerClient();

    const { data, error } = await sb.rpc("analytics_skill_momentum");

    if (error) throw error;

    // RPC returns the complete JSON object directly
    const result = data as {
      skills: { skill: string; total: number; daily: { day: string; count: number }[] }[] | null;
      dailyJobs: { day: string; count: number }[] | null;
      dateRange: { start: string; end: string } | null;
    };

    if (!result?.skills?.length) {
      return NextResponse.json({ skills: [], dailyJobs: [], dateRange: null });
    }

    return NextResponse.json({
      skills: result.skills,
      dailyJobs: result.dailyJobs ?? [],
      dateRange: result.dateRange,
    });
  } catch (err) {
    console.error("[analytics/skill-momentum]", err);
    return NextResponse.json({ error: "Failed to fetch skill momentum" }, { status: 500 });
  }
}
