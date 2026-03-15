// analytics/cooccurrence
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = createServerClient();

    const { data, error } = await sb.rpc("analytics_skill_cooccurrence");

    if (error) throw error;

    const pairs = (data as { skill_a: string; skill_b: string; pair_count: number }[]).map(
      (r) => ({
        a: r.skill_a,
        b: r.skill_b,
        count: Number(r.pair_count),
      })
    );

    return NextResponse.json({ pairs });
  } catch (err) {
    console.error("[analytics/cooccurrence]", err);
    return NextResponse.json({ error: "Failed to fetch co-occurrence data" }, { status: 500 });
  }
}
