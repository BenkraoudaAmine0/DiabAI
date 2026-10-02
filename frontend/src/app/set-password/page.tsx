"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Logo from "@/components/Logo";
import { LangToggle, useI18n } from "@/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Stage = "checking" | "form" | "done" | "expired";

/** Landing page for invite-email links. Patients set their first password
 * here and are signed in when it succeeds. Handles every Supabase link
 * shape: ?code= (PKCE, exchanged by /auth/callback or here), #access_token
 * (implicit fallback), or an already-established session (cookies). */
export default function SetPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function resolve() {
      const url = new URL(window.location.href);
      const queryError =
        url.searchParams.get("error") ||
        url.searchParams.get("error_description");
      const hash = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
      );
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const hashError = hash.get("error_description");
      const code = url.searchParams.get("code");

      const fail = () => {
        window.history.replaceState(null, "", window.location.pathname);
        setStage("expired");
      };

      if (queryError || hashError) return fail();

      // implicit-flow link: tokens in the URL fragment
      if (accessToken && refreshToken) {
        const { error: err } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (err) return fail();
        window.history.replaceState(null, "", window.location.pathname);
        setStage("form");
        return;
      }

      // code landed directly here (no /auth/callback step)
      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        if (err) return fail();
        window.history.replaceState(null, "", window.location.pathname);
      }

      // already signed in via server callback cookies
      const { data } = await supabase.auth.getSession();
      setStage(data.session ? "form" : "expired");
    }

    resolve();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setBusy(true);
    try {
      const { error: err } =
        await getSupabaseBrowserClient().auth.updateUser({ password });
      if (err) {
        setError(err.message);
        return;
      }
      setStage("done");
      setTimeout(() => router.push("/patient"), 1200);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <LangToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Logo size={44} />
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {stage === "checking" && (
            <p className="text-center text-sm text-slate-500">
              {t("auth.inviteWorking")}
            </p>
          )}

          {stage === "expired" && (
            <>
              <h1 className="text-xl font-bold text-slate-900">
                {t("auth.linkExpired")}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {t("auth.linkExpiredDesc")}
              </p>
              <Link
                href="/login"
                className="mt-5 block w-full rounded-xl bg-teal-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-teal-700"
              >
                {t("common.login")}
              </Link>
            </>
          )}

          {stage === "form" && (
            <>
              <h1 className="text-2xl font-bold text-slate-900">
                {t("auth.setPasswordTitle")}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {t("auth.setPasswordSubtitle")}
              </p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.newPassword")}
                  className={inputCls}
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={t("auth.confirmPassword")}
                  className={inputCls}
                />
                {error && (
                  <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {busy ? t("auth.working") : t("auth.setPassword")}
                </button>
              </form>
            </>
          )}

          {stage === "done" && (
            <div className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
                ✓
              </span>
              <h1 className="mt-3 text-xl font-bold text-slate-900">
                {t("auth.passwordSet")}
              </h1>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
