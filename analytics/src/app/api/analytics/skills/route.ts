import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { aggregateSoftSkills, parseAnalysis } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = createServerClient();

    const [techRes, goodRes, qualsRes] = await Promise.all([
      sb.rpc("analytics_tech_skills"),
      sb.rpc("analytics_good_to_have"),
      sb.rpc("analytics_qualifications"),
    ]);

    if (techRes.error) throw techRes.error;
    if (goodRes.error) throw goodRes.error;
    if (qualsRes.error) throw qualsRes.error;

    const techSkills = (techRes.data as { keyword: string; count: number }[]).map((r) => ({
      keyword: r.keyword,
      count: Number(r.count),
    }));

    const goodToHave = (goodRes.data as { keyword: string; count: number }[]).map((r) => ({
      keyword: r.keyword,
      count: Number(r.count),
    }));

    // Build soft skills from qualifications RPC data
    const SOFT_PATTERNS: [RegExp, string][] = [
      [/communication/i, "Communication"],
      [/team|collaboration|collaborative/i, "Teamwork"],
      [/problem.solv/i, "Problem Solving"],
      [/bachelor|bs |b\.s\.|b\.sc/i, "Bachelor's Degree"],
      [/master|ms |m\.s\.|m\.sc/i, "Master's Degree"],
      [/leadership|lead/i, "Leadership"],
      [/agile|scrum/i, "Agile/Scrum"],
      [/years.*experience|experience.*years/i, "Experience Years"],
      [/fast.paced/i, "Fast-Paced Environment"],
      [/cross.functional/i, "Cross-Functional"],
      [/citizenship|clearance/i, "U.S. Citizenship/Clearance"],
      [/detail.oriented/i, "Detail-Oriented"],
    ];

    const softFreq: Record<string, number> = {};
    for (const row of qualsRes.data as { qualification: string; count: number }[]) {
      for (const [re, label] of SOFT_PATTERNS) {
        if (re.test(row.qualification)) {
          softFreq[label] = (softFreq[label] ?? 0) + Number(row.count);
          break;
        }
      }
    }
    const softSkills = Object.entries(softFreq)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return NextResponse.json({ techSkills, softSkills, goodToHave });
  } catch (err) {
    console.error("[analytics/skills]", err);
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 });
  }
}
