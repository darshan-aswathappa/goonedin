import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

// All aggregation happens in Postgres via analytics_experience_distribution() RPC.
// This covers ALL rows with no cap — previously limited to 50,000 raw rows
// transferred to Node.js for JS-side processing. Apply supabase/experience_rpc.sql
// to enable this.
export async function GET() {
  try {
    const sb = createServerClient();

    const { data, error } = await sb.rpc("analytics_experience_distribution");

    if (error) throw error;

    const result = data as {
      distribution: { label: string; count: number }[] | null;
      matched: number;
      total: number;
      matchRate: number;
    };

    return NextResponse.json({
      distribution: result?.distribution ?? [],
      matched: result?.matched ?? 0,
      total: result?.total ?? 0,
      matchRate: result?.matchRate ?? 0,
    });
  } catch (err) {
    console.error("[analytics/experience]", err);
    return NextResponse.json({ error: "Failed to fetch experience data" }, { status: 500 });
  }
}
