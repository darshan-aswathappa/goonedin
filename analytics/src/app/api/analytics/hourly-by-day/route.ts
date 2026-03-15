import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET() {
  try {
    const sb = createServerClient();

    // Query hour + day-of-week counts from scraped_jobs
    const { data, error } = await sb.rpc("analytics_hourly_by_day");

    if (error) {
      // Fallback: raw SQL via .from if RPC doesn't exist yet
      // Try a direct query approach
      const { data: fallbackData, error: fallbackError } = await sb
        .from("scraped_jobs")
        .select("created_at")
        .limit(50000);

      if (fallbackError) throw fallbackError;

      // Compute in JS
      const buckets: Record<string, Record<number, number>> = {};
      for (const day of WEEKDAYS) {
        buckets[day] = {};
        for (let h = 0; h < 24; h++) buckets[day][h] = 0;
      }
      // Also track "All" aggregate
      const allHours: Record<number, number> = {};
      for (let h = 0; h < 24; h++) allHours[h] = 0;

      for (const row of fallbackData ?? []) {
        if (!row.created_at) continue;
        const d = new Date(row.created_at);
        const dow = d.getUTCDay();
        const hour = d.getUTCHours();
        const dayName = WEEKDAYS[dow];
        buckets[dayName][hour] = (buckets[dayName][hour] ?? 0) + 1;
        allHours[hour] = (allHours[hour] ?? 0) + 1;
      }

      const result: Record<string, { hour: number; count: number }[]> = {};
      result["All"] = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: allHours[h],
      }));
      for (const day of WEEKDAYS) {
        result[day] = Array.from({ length: 24 }, (_, h) => ({
          hour: h,
          count: buckets[day][h],
        }));
      }

      return NextResponse.json({ hourlyByDay: result });
    }

    // RPC returned data — shape: { dow: number, hour: number, count: number }[]
    const rows = data as { dow: number; hour: number; count: number }[];

    const result: Record<string, { hour: number; count: number }[]> = {};
    const allHours: Record<number, number> = {};
    for (let h = 0; h < 24; h++) allHours[h] = 0;

    for (const day of WEEKDAYS) {
      const hourMap: Record<number, number> = {};
      for (let h = 0; h < 24; h++) hourMap[h] = 0;

      for (const r of rows) {
        if (WEEKDAYS[r.dow] === day) {
          hourMap[r.hour] = Number(r.count);
          allHours[r.hour] += Number(r.count);
        }
      }

      result[day] = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: hourMap[h],
      }));
    }

    result["All"] = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: allHours[h],
    }));

    return NextResponse.json({ hourlyByDay: result });
  } catch (err) {
    console.error("[analytics/hourly-by-day]", err);
    return NextResponse.json(
      { error: "Failed to fetch hourly-by-day data" },
      { status: 500 }
    );
  }
}
