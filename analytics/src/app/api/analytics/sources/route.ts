import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

export async function GET() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_sources");
    if (error) throw error;

    // Brand colors are deliberately dropped: the paper DS admits no outside
    // hues, so each source takes a slot on the earthy categorical series.
    const COLORS: Record<string, string> = {
      LinkedIn: "var(--series-1)", // brick
      GitHub: "var(--series-2)", // forest
      MathWorks: "var(--series-3)", // slate
      Jobright: "var(--series-4)", // mauve
      Custom: "var(--muted)", // stone — catch-all
    };

    const sources = (data as { source: string; count: number }[]).map((r) => ({
      source: r.source,
      count: Number(r.count),
      color: COLORS[r.source] ?? "var(--muted)",
    }));

    return NextResponse.json({ sources });
  } catch (err) {
    console.error("[analytics/sources]", err);
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
  }
}
