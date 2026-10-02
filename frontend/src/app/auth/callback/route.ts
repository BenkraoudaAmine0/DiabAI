import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Auth email-link callback (invite / confirmation / magic-link).
 * Exchanges the one-time `?code=` for a session (PKCE), then forwards to
 * `next` (default: /set-password). Fragment-token links (implicit flow
 * fallback) are handled client-side by /set-password.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/set-password";
  const origin = requestUrl.origin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (code && url && key) {
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      });
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        // invalid/expired code — still land on /set-password, which shows
        // a clear "link invalid" message once it finds no session
        return NextResponse.redirect(`${origin}/set-password?error=expired`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    } catch {
      return NextResponse.redirect(`${origin}/set-password?error=expired`);
    }
  }

  // no code (implicit-flow link or already-used link) — let the page decide
  return NextResponse.redirect(`${origin}${next}`);
}
