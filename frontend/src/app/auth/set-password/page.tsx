"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Logo from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { LangToggle, useI18n } from "@/i18n";
import { LOGIN_EMAIL, RECOVERY_FLAG, readSession, writeSession } from "@/lib/authFlow";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Phase = "checking" | "ready" | "invalid";

/** Landing page of invitation emails ("your doctor created your account")
 *  and password-reset emails: opens the session carried by the link, asks
 *  for a password, then sends the user to sign in with it.
 *
 *  Links come in three shapes:
 *   #access_token=…&refresh_token=…&type=invite   Supabase's default invite /
 *        admin links (implicit flow). @supabase/ssr's client is PKCE-only and
 *        rejects these ("Not a valid PKCE flow url"), so the session is set
 *        here by hand.
 *   ?token_hash=…&type=invite|recovery   custom email template (README)
 *   ?code=…   reset requested from the login page (PKCE) — the client
 *        exchanges it by itself on load. */
export default function SetPasswordPage() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [recovery, setRecovery] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const type = hash.get("type") ?? query.get("type");
    const isRecovery = type === "recovery" || readSession(RECOVERY_FLAG) === "1";

    (async () => {
      let failed = Boolean(hash.get("error_description") ?? query.get("error_description"));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const tokenHash = query.get("token_hash");

      if (!failed && accessToken && refreshToken) {
        const { error: err } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        failed = Boolean(err);
      } else if (!failed && tokenHash) {
        const { error: err } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type === "recovery" ? "recovery" : "invite",
        });
        failed = Boolean(err);
      }
      // tokens never stay in the address bar / history
      window.history.replaceState(null, "", window.location.pathname);

      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (failed || !user) {
        setPhase("invalid");
        return;
      }
      setRecovery(isRecovery);
      setEmail(user.email ?? "");
      setName(String(user.user_metadata?.full_name ?? ""));
      setPhase("ready");
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t("setpw.tooShort"));
    if (password !== confirm) return setError(t("setpw.mismatch"));
    setBusy(true);
    try {
      const { error: err } = await getSupabaseBrowserClient().auth.updateUser({ password });
      if (err) {
        setError(err.message);
        return;
      }
      writeSession(RECOVERY_FLAG, null);
      writeSession(LOGIN_EMAIL, email);
      // sign in again with the new password — proves it works
      await signOut();
      router.replace("/login?passwordSet=1");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <LangToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size={44} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {phase === "checking" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
              <p className="text-sm text-slate-500">{t("setpw.checking")}</p>
            </div>
          )}

          {phase === "invalid" && (
            <>
              <h1 className="text-2xl font-bold text-slate-900">{t("setpw.invalidTitle")}</h1>
              <p className="mt-3 text-sm text-slate-600">{t("setpw.invalidDesc")}</p>
              <Link
                href="/login"
                className="mt-6 block w-full rounded-xl bg-teal-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-teal-700"
              >
                {t("common.login")}
              </Link>
            </>
          )}

          {phase === "ready" && (
            <>
              <h1 className="text-2xl font-bold text-slate-900">
                {t(recovery ? "setpw.titleRecovery" : "setpw.titleInvite")}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {recovery
                  ? t("setpw.recoveryDesc")
                  : name
                    ? t("setpw.welcome", { name })
                    : t("setpw.welcomeNoName")}
              </p>
              <p className="mt-4 rounded-lg bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
                {t("setpw.account")}: <strong className="text-slate-800">{email}</strong>
              </p>
              <form onSubmit={submit} className="mt-5 space-y-4">
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("setpw.password")}
                    aria-label={t("setpw.password")}
                    className={`${inputCls} pr-20`}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-teal-700"
                  >
                    {show ? t("setpw.hide") : t("setpw.show")}
                  </button>
                </div>
                <input
                  type={show ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={t("setpw.confirm")}
                  aria-label={t("setpw.confirm")}
                  className={inputCls}
                />
                <p className="text-xs text-slate-400">{t("setpw.rules")}</p>
                {error && (
                  <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {busy ? t("auth.working") : t("setpw.submit")}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
