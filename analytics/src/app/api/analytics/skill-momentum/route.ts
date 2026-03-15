import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Soft skills / non-technical blocklist
const SOFT_BLOCKLIST = new Set([
  "communication", "communication skills", "written communication",
  "teamwork", "collaboration", "collaborative", "team player",
  "problem solving", "problem-solving", "analytical thinking",
  "leadership", "mentoring", "coaching", "mentorship",
  "agile", "scrum", "agile/scrum", "agile methodologies",
  "detail-oriented", "detail oriented", "attention to detail",
  "self-starter", "self-motivated", "self starter",
  "time management", "project management",
  "critical thinking", "creative thinking",
  "fast-paced", "fast-paced environment", "fast paced",
  "cross-functional", "cross functional",
  "adaptability", "flexibility", "adaptable",
  "ownership", "accountability",
  "presentation skills", "public speaking",
  "english fluency", "english", "bilingual",
  "recruitment", "hiring", "onboarding",
  "commercialization", "business development", "sales",
  "stakeholder management", "client-facing", "client facing",
  "strategic thinking", "strategy", "strategic planning",
  "organizational skills", "multitasking", "multi-tasking",
  "interpersonal skills", "negotiation", "conflict resolution",
  "remote work", "hybrid", "on-site",
  "bachelor's degree", "master's degree", "phd", "degree",
  "years of experience", "experience", "proven track record",
  "passion", "passionate", "enthusiastic", "motivated",
  "excellent communication", "strong communication",
  "team-oriented", "results-driven", "results driven",
  "waterfall", "technical team leadership", "technical leadership",
  "technical writing", "lustre", "lustre development",
]);

function isSoftSkill(skill: string): boolean {
  if (SOFT_BLOCKLIST.has(skill)) return true;
  if (/\b(communicat|leadership|collaborat|mentor|coach|passion|motivated|enthusias)/i.test(skill)) return true;
  if (/\b(stakeholder|interpersonal|organizational|accountability|ownership)/i.test(skill)) return true;
  if (/\byears?\s+(of\s+)?experience\b/i.test(skill)) return true;
  if (/\bdegree\b/i.test(skill)) return true;
  return false;
}

export async function GET() {
  try {
    const sb = createServerClient();

    const { data: cacheRows, error } = await sb
      .from("job_analysis_cache")
      .select("external_id, analysis, created_at")
      .eq("analysis_status", "completed");

    if (error) throw error;
    if (!cacheRows?.length) {
      return NextResponse.json({ skills: [], dateRange: null });
    }

    // Per-skill per-day counts + total per day (for normalization)
    const skillDayCounts: Record<string, Record<string, number>> = {};
    const jobsPerDay: Record<string, number> = {};

    for (const row of cacheRows) {
      let analysis = row.analysis;
      while (typeof analysis === "string") {
        try { analysis = JSON.parse(analysis); } catch { break; }
      }
      if (!analysis || typeof analysis !== "object") continue;

      const keywords = [
        ...(analysis.must_have_keywords ?? []),
        ...(analysis.good_to_have_keywords ?? []),
      ];
      if (!keywords.length) continue;

      const day = row.created_at?.slice(0, 10);
      if (!day) continue;

      jobsPerDay[day] = (jobsPerDay[day] ?? 0) + 1;

      const seen = new Set<string>(); // dedupe within one job
      for (const kw of keywords) {
        const key = kw.trim().toLowerCase();
        if (key.length < 2 || key.length > 50 || isSoftSkill(key) || seen.has(key)) continue;
        seen.add(key);
        if (!skillDayCounts[key]) skillDayCounts[key] = {};
        skillDayCounts[key][day] = (skillDayCounts[key][day] ?? 0) + 1;
      }
    }

    // Build sorted list of all days
    const allDays = Object.keys(jobsPerDay).sort();
    if (allDays.length < 2) {
      return NextResponse.json({ skills: [], dateRange: null });
    }

    // Build skill objects with daily arrays and total
    const MIN_TOTAL = 20;
    const skillList: {
      skill: string;
      total: number;
      daily: { day: string; count: number }[];
    }[] = [];

    for (const [skill, dayCounts] of Object.entries(skillDayCounts)) {
      const total = Object.values(dayCounts).reduce((a, b) => a + b, 0);
      if (total < MIN_TOTAL) continue;

      const daily = allDays.map((day) => ({
        day,
        count: dayCounts[day] ?? 0,
      }));

      skillList.push({ skill, total, daily });
    }

    // Also return jobs-per-day so the client can normalize
    const dailyJobs = allDays.map((day) => ({
      day,
      count: jobsPerDay[day] ?? 0,
    }));

    return NextResponse.json({
      skills: skillList,
      dailyJobs,
      dateRange: { start: allDays[0], end: allDays[allDays.length - 1] },
    });
  } catch (err) {
    console.error("[analytics/skill-momentum]", err);
    return NextResponse.json({ error: "Failed to fetch skill momentum" }, { status: 500 });
  }
}
