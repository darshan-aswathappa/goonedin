import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_weekday");
    if (error) throw error;

    const dowMap = new Map(
      (data as { dow: number; day_name: string; count: number }[]).map((r) => [
        Number(r.dow),
        Number(r.count),
      ])
    );

    const weekday = WEEKDAYS.map((day, i) => ({ day, count: dowMap.get(i) ?? 0 }));
    const peak = weekday.reduce((best, d) => (d.count > best.count ? d : best), weekday[0]);

    return NextResponse.json({ weekday, peakDay: peak?.day ?? null });
  } catch (err) {
    console.error("[analytics/weekday]", err);
    return NextResponse.json({ error: "Failed to fetch weekday data" }, { status: 500 });
  }
}
