"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Lazily created browser client (never at module scope, so builds work
 * even before .env.local exists). */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy frontend/.env.example to " +
        "frontend/.env.local and fill in your project URL and anon key."
    );
  }
  client = createBrowserClient(url, key);
  return client;
}
