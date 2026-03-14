import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fillDateRange } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_timeline");
    if (error) throw error;

    const raw = (data as { day: string; count: number }[]).map((r) => ({
      day: r.day,
      count: Number(r.count),
    }));

    const timeline = fillDateRange(raw, 30);
    return NextResponse.json({ timeline });
  } catch (err) {
    console.error("[analytics/timeline]", err);
    return NextResponse.json({ error: "Failed to fetch timeline" }, { status: 500 });
  }
}
