import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { aggregateSalaryByFunction, deduplicateJobs } from "@/lib/analytics";

export const revalidate = 60;

export async function GET() {
  try {
    const sb = createServerClient();

    const { data: rows, error } = await sb
      .from("scraped_jobs")
      .select("external_id, title, salary, created_at")
      .not("salary", "is", null)
      .not("title", "is", null);

    if (error) throw error;

    const deduped = deduplicateJobs(rows ?? []);

    const functions = aggregateSalaryByFunction(
      deduped.map((r) => ({
        external_id: r.external_id,
        title: (r as { title?: string | null }).title ?? null,
        salary: (r as { salary?: string | null }).salary ?? null,
      }))
    );

    return NextResponse.json({ functions });
  } catch (err) {
    console.error("[analytics/salary-by-function]", err);
    return NextResponse.json(
      { error: "Failed to fetch salary by function" },
      { status: 500 }
    );
  }
}
