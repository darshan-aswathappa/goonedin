import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { aggregateSalary } from "@/lib/analytics";

export const dynamic = "force-dynamic";

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
    const rows = (salaryRes.data as { salary: string; count: number }[]).flatMap((r) =>
      Array.from({ length: Number(r.count) }, (_, i) => ({
        external_id: `${r.salary}-${i}`,
        salary: r.salary,
      }))
    );

    const result = aggregateSalary(rows, totalJobs);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[analytics/salary]", err);
    return NextResponse.json({ error: "Failed to fetch salary data" }, { status: 500 });
  }
}
