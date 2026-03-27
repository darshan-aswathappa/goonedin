import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { getBlockedCompanies, isBlocked } from "@/lib/blocked-companies";
import { resolveJobDate } from "@/lib/analytics";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

const COMPANY_COLORS = ["#00bfff", "#ff6b6b", "#4ade80", "#ffd700", "#f97316"];

export async function GET() {
  try {
    const sb = createServerClient();

    const [topRes, blocked] = await Promise.all([
      sb.rpc("analytics_top_companies"),
      getBlockedCompanies(),
    ]);

    if (topRes.error) throw topRes.error;

    const top5 = (topRes.data as { company: string; count: number }[])
      .filter((r) => !isBlocked(r.company, blocked))
      .slice(0, 5)
      .map((r) => r.company);

    if (!top5.length) return NextResponse.json({ companies: [], data: [] });

    // Build last-7-day date labels
    const days = 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateLabels: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dateLabels.push(d.toISOString().slice(0, 10));
    }

    const cutoff = dateLabels[0];

    // Fetch raw job rows for top-5 companies in the window
    const { data: rows, error } = await sb
      .from("scraped_jobs")
      .select("company, posted_at, created_at, external_id")
      .in("company", top5)
      .gte("created_at", cutoff);

    if (error) throw error;

    // Deduplicate by external_id per company and count by day
    const seen = new Set<string>();
    const counts: Record<string, Record<string, number>> = {};

    for (const company of top5) {
      counts[company] = {};
      for (const day of dateLabels) counts[company][day] = 0;
    }

    for (const row of rows as {
      company: string;
      posted_at: string | null;
      created_at: string | null;
      external_id: string;
    }[]) {
      const key = `${row.company}:${row.external_id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const day = resolveJobDate(row);
      if (!day || !counts[row.company] || !dateLabels.includes(day)) continue;
      counts[row.company][day]++;
    }

    const data = dateLabels.map((day) => {
      const entry: Record<string, string | number> = { day };
      for (const company of top5) {
        entry[company] = counts[company]?.[day] ?? 0;
      }
      return entry;
    });

    const companies = top5.map((name, i) => ({
      name,
      color: COMPANY_COLORS[i] ?? "#64748b",
    }));

    return NextResponse.json({ companies, data });
  } catch (err) {
    console.error("[analytics/hiring-velocity]", err);
    return NextResponse.json({ error: "Failed to fetch hiring velocity" }, { status: 500 });
  }
}
