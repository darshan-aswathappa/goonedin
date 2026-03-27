import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

export async function GET() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_overview");
    if (error) throw error;

    const d = data as {
      total: number;
      uniqueCompanies: number;
      analyzed: number;
      jobs30d: number;
      avgJobsPerDay: number;
    };

    return NextResponse.json({
      total: d.total,
      analyzed: d.analyzed,
      completionRate: d.total > 0 ? Math.round((d.analyzed / d.total) * 100) : 0,
      uniqueCompanies: d.uniqueCompanies,
      avgJobsPerDay: d.avgJobsPerDay,
      jobs30d: d.jobs30d,
    });
  } catch (err) {
    console.error("[analytics/overview]", err);
    return NextResponse.json({ error: "Failed to fetch overview" }, { status: 500 });
  }
}
