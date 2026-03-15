import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { getBlockedCompanies, isBlocked } from "@/lib/blocked-companies";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = createServerClient();

    const [companiesRes, hourlyRes, blocked] = await Promise.all([
      sb.rpc("analytics_top_companies"),
      sb.rpc("analytics_hourly_distribution"),
      getBlockedCompanies(),
    ]);

    if (companiesRes.error) throw companiesRes.error;
    if (hourlyRes.error) throw hourlyRes.error;

    const topCompanies = (companiesRes.data as { company: string; count: number }[])
      .filter((r) => !isBlocked(r.company, blocked))
      .map((r) => ({
        company: r.company,
        count: Number(r.count),
      }));

    const hourlyRaw = (hourlyRes.data as { hour: number; count: number }[]).map((r) => ({
      hour: Number(r.hour),
      count: Number(r.count),
    }));

    // Fill missing hours with 0
    const hourMap = new Map(hourlyRaw.map((r) => [r.hour, r.count]));
    const hourlyDistribution = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourMap.get(h) ?? 0,
    }));

    return NextResponse.json({ topCompanies, hourlyDistribution });
  } catch (err) {
    console.error("[analytics/companies]", err);
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
  }
}
