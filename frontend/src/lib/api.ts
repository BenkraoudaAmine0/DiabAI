"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Fetch wrapper for the FastAPI backend — attaches the Supabase token. */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const isJson = init.body && !(init.body instanceof FormData);
  if (isJson && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const res = await fetch(`${base}${path}`, { ...init, headers });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* keep status text */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}
