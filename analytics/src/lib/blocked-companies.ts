import { createServerClient } from "./supabase-server";

let _cache: string[] | null = null;
let _cacheTs = 0;
const CACHE_TTL = 120_000; // 2 minutes

/**
 * Fetch the list of blocked analytics company names (case-insensitive lowercase).
 * Cached in-memory for 2 minutes.
 */
export async function getBlockedCompanies(): Promise<string[]> {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;

  const sb = createServerClient();
  const { data, error } = await sb
    .from("blocked_analytics_companies")
    .select("company_name");

  if (error) {
    console.error("[blocked-companies] fetch error:", error);
    return _cache ?? [];
  }

  _cache = (data as { company_name: string }[]).map((r) =>
    r.company_name.toLowerCase()
  );
  _cacheTs = Date.now();
  return _cache;
}

/**
 * Check if a company name matches any blocked company (case-insensitive, substring match).
 */
export function isBlocked(company: string, blockedList: string[]): boolean {
  const lower = company.toLowerCase();
  return blockedList.some((b) => lower.includes(b) || b.includes(lower));
}
