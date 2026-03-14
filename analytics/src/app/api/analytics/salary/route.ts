import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { aggregateSalary } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_salary_strings");
    if (error) throw error;

    // Expand grouped salary strings back into individual rows for aggregateSalary
    const rows = (data as { salary: string; count: number }[]).flatMap((r) =>
      Array.from({ length: Number(r.count) }, (_, i) => ({
        external_id: `${r.salary}-${i}`,
        salary: r.salary,
      }))
    );

    const result = aggregateSalary(rows);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[analytics/salary]", err);
    return NextResponse.json({ error: "Failed to fetch salary data" }, { status: 500 });
  }
}
