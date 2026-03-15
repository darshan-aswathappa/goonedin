import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { parseAnalysis } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// Normalise a keyword for deduplication/display
function normalizeKw(raw: string): string {
  const kw = raw.trim();
  if (kw.length < 2 || kw.length > 40) return "";
  const ACRONYMS = new Set([
    "sql", "api", "rest", "grpc", "aws", "gcp", "ci/cd", "mlops",
    "etl", "elt", "css", "html", "git", "k8s", "nlp", "llm", "ml", "ai",
    "java", "c++", "c#", "ios",
  ]);
  const lower = kw.toLowerCase();
  if (ACRONYMS.has(lower)) return kw.toUpperCase();
  // Title-case single-word keywords
  if (!kw.includes(" ")) return kw.charAt(0).toUpperCase() + kw.slice(1);
  return kw;
}

export async function GET() {
  try {
    const sb = createServerClient();

    // Fetch all completed analyses — only the keywords array we need
    const { data, error } = await sb
      .from("job_analysis_cache")
      .select("external_id, analysis")
      .eq("analysis_status", "completed")
      .not("analysis", "is", null);

    if (error) throw error;

    // Build co-occurrence counts
    const pairCounts: Map<string, number> = new Map();
    const skillCounts: Map<string, number> = new Map();

    for (const row of data ?? []) {
      const analysis = parseAnalysis(row.analysis);
      if (!analysis?.must_have_keywords?.length) continue;

      const kwds = Array.from(
        new Set(
          analysis.must_have_keywords
            .map(normalizeKw)
            .filter((k) => k.length > 0)
        )
      );

      // Count individual skills
      for (const k of kwds) {
        skillCounts.set(k, (skillCounts.get(k) ?? 0) + 1);
      }

      // Count pairs (only upper-triangle to avoid duplicates)
      for (let i = 0; i < kwds.length; i++) {
        for (let j = i + 1; j < kwds.length; j++) {
          const [a, b] = [kwds[i], kwds[j]].sort();
          const key = `${a}|||${b}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    // Top 25 pairs
    const pairs = Array.from(pairCounts.entries())
      .map(([key, count]) => {
        const [a, b] = key.split("|||");
        return { a, b, count };
      })
      .sort((x, y) => y.count - x.count)
      .slice(0, 25);

    // Top 12 individual skills for reference
    const topSkills = Array.from(skillCounts.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 12);

    return NextResponse.json({ pairs, topSkills });
  } catch (err) {
    console.error("[analytics/cooccurrence]", err);
    return NextResponse.json({ error: "Failed to fetch co-occurrence data" }, { status: 500 });
  }
}
