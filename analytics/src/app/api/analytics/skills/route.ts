import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { aggregateSoftSkills, parseAnalysis } from "@/lib/analytics"; // eslint-disable-line @typescript-eslint/no-unused-vars

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = createServerClient();

    const [techRes, goodRes, qualsRes, cooccRes] = await Promise.all([
      sb.rpc("analytics_tech_skills"),
      sb.rpc("analytics_good_to_have"),
      sb.rpc("analytics_qualifications"),
      sb.rpc("analytics_skill_cooccurrence"),
    ]);

    if (techRes.error) throw techRes.error;
    if (goodRes.error) throw goodRes.error;
    if (qualsRes.error) throw qualsRes.error;
    if (cooccRes.error) console.error("[skills] cooccurrence RPC error:", cooccRes.error);
    else console.log("[skills] cooccurrence rows:", cooccRes.data?.length ?? 0);

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
      [/leadership/i, "Leadership"],
      [/agile|scrum/i, "Agile / Scrum"],
      [/fast.paced/i, "Fast-Paced Env"],
      [/cross.functional/i, "Cross-Functional"],
      [/detail.oriented/i, "Detail-Oriented"],
      [/self.starter|self.motivated/i, "Self-Starter"],
      [/time management/i, "Time Management"],
      [/critical thinking/i, "Critical Thinking"],
      [/analytical/i, "Analytical Thinking"],
      [/mentor|coach/i, "Mentoring"],
      [/presentation|present\b/i, "Presentation Skills"],
      [/written.*communication|writing skills/i, "Written Communication"],
      [/adaptab|flexible/i, "Adaptability"],
      [/ownership|accountab/i, "Ownership"],
      [/ambiguous|ambiguity/i, "Navigating Ambiguity"],
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
      .sort((a, b) => b.count - a.count);

    const cooccurrencePairs = cooccRes.error
      ? []
      : (cooccRes.data as { skill_a: string; skill_b: string; pair_count: number }[]).map((r) => ({
          a: r.skill_a,
          b: r.skill_b,
          count: Number(r.pair_count),
        }));

    return NextResponse.json({ techSkills, softSkills, goodToHave, cooccurrencePairs });
  } catch (err) {
    console.error("[analytics/skills]", err);
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 });
  }
}
