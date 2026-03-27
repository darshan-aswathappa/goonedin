import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { aggregateSeniority, aggregateTitleKeywords, aggregateJobFunctions } from "@/lib/analytics";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

export async function GET() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_titles");
    if (error) throw error;

    // Expand grouped titles for aggregation functions
    const expanded = (data as { title: string; count: number }[]).flatMap((r) =>
      Array.from({ length: Number(r.count) }, () => ({ title: r.title }))
    );

    const seniority = aggregateSeniority(expanded);
    const titleKeywords = aggregateTitleKeywords(expanded);
    const jobFunctions = aggregateJobFunctions(expanded);

    return NextResponse.json({ seniority, titleKeywords, jobFunctions });
  } catch (err) {
    console.error("[analytics/seniority]", err);
    return NextResponse.json({ error: "Failed to fetch seniority data" }, { status: 500 });
  }
}
