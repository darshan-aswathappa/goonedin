import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface MomentumEntry {
  skill: string;
  recent: number;
  prior: number;
  delta: number;
}

export async function GET() {
  try {
    const sb = createServerClient();

    // Try RPC first, fall back to direct query
    const rpcRes = await sb.rpc("analytics_skill_momentum");

    if (!rpcRes.error && rpcRes.data?.length) {
      const raw = rpcRes.data as { skill: string; recent_count: number; prior_count: number; delta: number }[];
      const momentum: MomentumEntry[] = raw
        .filter((r) => r.prior_count >= 2 || r.recent_count >= 3)
        .map((r) => ({
          skill: r.skill,
          recent: Number(r.recent_count),
          prior: Number(r.prior_count),
          delta: Number(r.delta),
        }));

      const rising = momentum.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10);
      const declining = momentum.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10);

      return NextResponse.json({ rising, declining });
    }

    // Fallback: query job_analysis_cache directly
    const { data: cacheRows, error } = await sb
      .from("job_analysis_cache")
      .select("external_id, analysis, created_at")
      .eq("analysis_status", "completed");

    if (error) throw error;

    const now = new Date();
    const d14 = new Date(now.getTime() - 14 * 86400000);
    const d28 = new Date(now.getTime() - 28 * 86400000);

    const recentFreq: Record<string, number> = {};
    const priorFreq: Record<string, number> = {};

    for (const row of cacheRows ?? []) {
      const analysis = typeof row.analysis === "string" ? JSON.parse(row.analysis) : row.analysis;
      if (!analysis?.must_have_keywords) continue;
      const date = new Date(row.created_at);
      const target = date >= d14 ? recentFreq : date >= d28 ? priorFreq : null;
      if (!target) continue;
      for (const kw of analysis.must_have_keywords) {
        const key = kw.trim().toLowerCase();
        if (key.length >= 2) target[key] = (target[key] ?? 0) + 1;
      }
    }

    // Merge and compute delta
    const allSkills = new Set([...Object.keys(recentFreq), ...Object.keys(priorFreq)]);
    const momentum: MomentumEntry[] = [];
    for (const skill of allSkills) {
      const recent = recentFreq[skill] ?? 0;
      const prior = priorFreq[skill] ?? 0;
      if (recent + prior < 3) continue; // noise filter
      momentum.push({ skill, recent, prior, delta: recent - prior });
    }

    const rising = momentum.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10);
    const declining = momentum.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10);

    return NextResponse.json({ rising, declining });
  } catch (err) {
    console.error("[analytics/skill-momentum]", err);
    return NextResponse.json({ error: "Failed to fetch skill momentum" }, { status: 500 });
  }
}
