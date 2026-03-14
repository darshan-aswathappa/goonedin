import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_sources");
    if (error) throw error;

    const COLORS: Record<string, string> = {
      LinkedIn: "#0077b5",
      GitHub: "#6e40c9",
      MathWorks: "#e6621a",
      Jobright: "#00d4aa",
      Custom: "#64748b",
    };

    const sources = (data as { source: string; count: number }[]).map((r) => ({
      source: r.source,
      count: Number(r.count),
      color: COLORS[r.source] ?? "#64748b",
    }));

    return NextResponse.json({ sources });
  } catch (err) {
    console.error("[analytics/sources]", err);
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
  }
}
