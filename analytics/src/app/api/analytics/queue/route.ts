import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const revalidate = 60; // Cache for 60 seconds; revalidates in background

export async function GET() {
  try {
    const sb = createServerClient();
    const { data, error } = await sb.rpc("analytics_queue_health");
    if (error) throw error;

    const d = data as {
      completed: number;
      failed: number;
      pending: number;
      total: number;
      withVisa: number;
      withSalary: number;
      analyzedCount: number;
    };

    const total = Number(d.total);
    const completed = Number(d.completed);
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const analyzedCount = Number(d.analyzedCount);

    return NextResponse.json({
      completed,
      failed: Number(d.failed),
      pending: Number(d.pending),
      total,
      successRate,
      withVisa: Number(d.withVisa),
      withSalary: Number(d.withSalary),
      analyzedCount,
    });
  } catch (err) {
    console.error("[analytics/queue]", err);
    return NextResponse.json({ error: "Failed to fetch queue data" }, { status: 500 });
  }
}
