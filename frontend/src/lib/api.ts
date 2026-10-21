"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function request(path: string, init: RequestInit = {}): Promise<Response> {
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
      // FastAPI validation errors: [{loc, msg, type}, …]
      else if (Array.isArray(body?.detail)) {
        const msgs = body.detail
          .map((d: { msg?: string; loc?: unknown[] }) => {
            const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null;
            return d?.msg ? (typeof field === "string" ? `${field}: ${d.msg}` : d.msg) : null;
          })
          .filter(Boolean);
        if (msgs.length) detail = msgs.join(" · ");
      }
    } catch {
      /* keep status text */
    }
    redirectForTwoFactor(res.status, detail);
    if (res.status === 403 && detail === APPROVAL_PENDING && typeof window !== "undefined") {
      window.dispatchEvent(new Event(APPROVAL_REQUIRED)); // DoctorShell re-reads the profile
    }
    throw new Error(detail);
  }
  return res;
}

/** backend app/auth.py PENDING_DOCTOR_DETAIL: a doctor whose account an admin
 *  has not approved (or has revoked) */
export const APPROVAL_PENDING = "Your doctor account is waiting for an administrator's approval.";
export const APPROVAL_REQUIRED = "diabai:approval-required";

/** The backend refuses a session that still needs its 2FA code (401), or a
 *  doctor/admin without 2FA when the admin policy requires it (403): send
 *  the user to the step that unblocks them. */
function redirectForTwoFactor(status: number, detail: string): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (status === 401 && detail === "Two-factor verification required" && pathname !== "/login") {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- not a component (no router here); a full load also resets page state
    window.location.assign(`/login?mfa=1&next=${encodeURIComponent(pathname + search)}`);
  } else if (status === 403 && detail === "mfa_setup_required" && pathname !== "/doctor/settings") {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- not a component (no router here); a full load also resets page state
    window.location.assign("/doctor/settings?tab=security&mfa=required");
  }
}

/** Fetch wrapper for the FastAPI backend — attaches the Supabase token. */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await request(path, init);
  return res.json() as Promise<T>;
}

/** Downloads a file from the backend (e.g. a PDF report) under `filename`. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await (await request(path)).blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
