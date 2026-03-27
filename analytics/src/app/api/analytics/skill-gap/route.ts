import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

// All aggregation happens in Postgres via analytics_skill_gap() RPC.
// Returns structured skill demand data including must-have vs good-to-have
// classification, growth rates, and date range metadata.
export async function GET() {
  try {
    const sb = createServerClient();

    const { data, error } = await sb.rpc("analytics_skill_gap");

    if (error) throw error;

    // RPC returns the complete JSON object directly
    const result = data as {
      skills: {
        skill: string;
        must_have: number;
        good_to_have: number;
        total: number;
        recent: number;
        prior: number;
        growth: number;
      }[] | null;
      dateRange: { start: string; end: string } | null;
    };

    if (!result?.skills?.length) {
      return NextResponse.json({ skills: [], dateRange: null });
    }

    return NextResponse.json({
      skills: result.skills,
      dateRange: result.dateRange,
    });
  } catch (err) {
    console.error("[analytics/skill-gap]", err);
    return NextResponse.json({ error: "Failed to fetch skill gap" }, { status: 500 });
  }
}
