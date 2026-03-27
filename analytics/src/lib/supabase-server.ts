import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using service key
// NEVER export this to client components

// Module-level singleton: one client per Node.js process, shared across requests.
// This avoids the overhead of creating a new HTTP connection pool per route handler.
let _client: SupabaseClient | null = null;

export function createServerClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables"
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}
