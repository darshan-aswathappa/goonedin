import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { aggregateSalary } from "@/lib/analytics";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

export async function GET() {
  try {
    const sb = createServerClient();

    // Fetch salary strings and total unique job count in parallel
    const [salaryRes, overviewRes] = await Promise.all([
      sb.rpc("analytics_salary_strings"),
      sb.rpc("analytics_overview"),
    ]);
    if (salaryRes.error) throw salaryRes.error;

    const totalJobs = overviewRes.error
      ? undefined
      : (overviewRes.data as { total: number })?.total;

    // Expand grouped salary strings back into individual rows for aggregateSalary
    // Cap expansion to prevent memory issues with unexpectedly large counts
    const MAX_EXPANSION = 50_000;
    let expanded = 0;
    const rows: { external_id: string; salary: string }[] = [];
    for (const r of salaryRes.data as { salary: string; count: number }[]) {
      const count = Math.min(Number(r.count) || 0, MAX_EXPANSION - expanded);
      if (count <= 0) break;
      for (let i = 0; i < count; i++) {
        rows.push({ external_id: `${r.salary}-${i}`, salary: r.salary });
      }
      expanded += count;
    }

    const result = aggregateSalary(rows, totalJobs);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[analytics/salary]", err);
    return NextResponse.json({ error: "Failed to fetch salary data" }, { status: 500 });
  }
}
