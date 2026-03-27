import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { aggregateVisa } from "@/lib/analytics";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

export async function GET() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_visa");
    if (error) throw error;

    // Map SQL result {visa, count} → {visa} objects for aggregateVisa
    const rows = (data as { visa: string; count: number }[]).flatMap((r) => {
      const visaVal = r.visa === "__null__" ? null : r.visa;
      return Array.from({ length: Number(r.count) }, () => ({ visa: visaVal }));
    });

    const visa = aggregateVisa(rows);
    const knownTotal = visa
      .filter((v) => v.label !== "Unknown")
      .reduce((s, v) => s + v.count, 0);
    const sponsorship = visa.find((v) => v.label === "Sponsorship Available");
    const total = visa.reduce((s, v) => s + v.count, 0);
    const sponsorshipRate =
      knownTotal > 0 && sponsorship
        ? Math.round((sponsorship.count / knownTotal) * 100)
        : 0;

    return NextResponse.json({ visa, total, sponsorshipRate });
  } catch (err) {
    console.error("[analytics/visa]", err);
    return NextResponse.json({ error: "Failed to fetch visa data" }, { status: 500 });
  }
}
