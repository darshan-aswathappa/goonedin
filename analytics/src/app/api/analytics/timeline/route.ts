import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fillDateRange } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const days = Math.min(Math.max(Number(searchParams.get("days")) || 30, 1), 365);
    const rawSource = searchParams.get("source") || "";
    const source = /^[a-zA-Z0-9 _-]{0,50}$/.test(rawSource) ? rawSource : "";

    const sb = createServerClient();

    // Aggregate in SQL — no row-limit issues, returns one row per day
    const { data, error } = await sb.rpc("analytics_timeline", {
      p_days: days,
      p_source: source || null,
    });

    if (error) throw error;

    const raw = (data as { day: string; count: number }[]).map((r) => ({
      day: r.day,
      count: Number(r.count),
    }));

    const timeline = fillDateRange(raw, days);

    return NextResponse.json({ timeline });
  } catch (err) {
    console.error("[analytics/timeline]", err);
    return NextResponse.json({ error: "Failed to fetch timeline" }, { status: 500 });
  }
}
