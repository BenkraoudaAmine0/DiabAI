"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False until .env.local holds a real project (not the .env.example
 * placeholders). Build-time constants: same answer on server and client. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && key && !url.includes("YOUR-PROJECT") && !key.startsWith("your-"));
}

/** Lazily created browser client (never at module scope, so builds work
 * even before .env.local exists). */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (client) return client;
  if (!url || !key || !isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Copy frontend/.env.example to " +
        "frontend/.env.local, fill in your project URL and anon key, then " +
        "restart the dev server (npm run dev)."
    );
  }
  client = createBrowserClient(url, key);
  return client;
}
