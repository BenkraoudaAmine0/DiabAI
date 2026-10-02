"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type Lang } from "@/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const REMEMBER_KEY = "diabai-remember-email";

/** DiabAI water-drop brand mark (login page). */
function DropletLogo({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M24 3.5C24 3.5 9.5 20.6 9.5 30.2a14.5 14.5 0 0 0 29 0C38.5 20.6 24 3.5 24 3.5Z"
        fill="#0E7C66"
      />
      <circle cx="19" cy="27.5" r="2.3" fill="#CDEEE2" />
      <circle cx="29" cy="27.5" r="2.3" fill="#CDEEE2" />
      <path
        d="M19 34.5c1.6 1.7 3.3 2.5 5 2.5s3.4-.8 5-2.5"
        stroke="#CDEEE2"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Segmented EN/FR pill, styled after the login mockup. */
function SegmentedLangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="inline-flex items-center rounded-full bg-slate-100 p-1">
      {(["en", "fr"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-full px-3.5 py-1.5 text-xs font-bold uppercase transition-colors ${
            lang === l
              ? "bg-[#0E7C66] text-white shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export default function LoginPage() {
  const { t } = useI18n();
  const { refreshProfile } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(
          authError.message.includes("Invalid login credentials")
            ? t("auth.invalid")
            : authError.message
        );
        return;
      }
      if (remember) window.localStorage.setItem(REMEMBER_KEY, email);
      else window.localStorage.removeItem(REMEMBER_KEY);
      await refreshProfile();
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq(
          "id",
          (await supabase.auth.getUser()).data.user?.id ?? ""
        )
        .single();
      router.push(
        data?.role === "admin"
          ? "/admin/dashboard"
          : data?.role === "doctor"
            ? "/doctor/dashboard"
            : "/patient"
      );
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword(e: React.MouseEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email) {
      setError(t("login.forgotNeedEmail"));
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/set-password`,
      }
    );
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setNotice(t("login.forgotSent"));
  }

  const inputClass =
    "w-full rounded-[10px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#0E7C66] focus:ring-2 focus:ring-[#0E7C66]/15";

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F8F6]">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200/80 bg-white px-6 py-5 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <DropletLogo />
          <span className="text-[22px] font-bold tracking-tight text-slate-900">
            DiabAI
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <SegmentedLangToggle />
          <Link
            href="/register"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            {t("common.register")}
          </Link>
        </div>
      </header>

      {/* Body: sign-in card + pitch */}
      <main className="flex flex-1 items-center px-6 py-10 lg:px-10">
        <div className="mx-auto grid w-full max-w-[1360px] items-center gap-14 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:gap-20">
          {/* Card */}
          <div className="rounded-3xl bg-white p-7 shadow-[0_24px_60px_-28px_rgba(11,59,49,0.28)] sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E7C66]">
              {t("login.eyebrow")}
            </p>
            <h1 className="mt-4 text-[2.5rem] font-bold leading-[1.15] tracking-tight text-[#113B32]">
              {t("auth.loginTitle")}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
              {t("auth.loginSubtitle")}
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-sm font-semibold text-slate-800"
                >
                  {t("login.emailLabel")}
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("login.emailPlaceholder")}
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-sm font-semibold text-slate-800"
                >
                  {t("common.password")}
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("login.passwordPlaceholder")}
                  className={inputClass}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-0.5">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-[#0E7C66]"
                  />
                  {t("login.remember")}
                </label>
                <a
                  href="#"
                  onClick={forgotPassword}
                  className="text-[13px] font-semibold text-[#0E7C66] hover:underline"
                >
                  {t("login.forgot")}
                </a>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </p>
              )}
              {notice && (
                <p className="rounded-lg bg-[#EAF5F0] px-4 py-3 text-sm text-[#0B4F41]">
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-[#0E7C66] px-4 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#0B6455] disabled:opacity-50"
              >
                {busy ? t("auth.working") : t("login.cta")}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              {t("auth.noAccount")}{" "}
              <Link
                href="/register"
                className="font-semibold text-[#0E7C66] hover:underline"
              >
                {t("common.register")}
              </Link>
            </p>

            <div className="mt-6 flex items-start gap-3.5 rounded-2xl bg-[#EAF5F0] p-4">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0E7C66]">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M5 12.5 10 17.5 19 7"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-[#123B32]">
                  {t("login.trustTitle")}
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">
                  {t("login.trustDesc")}
                </p>
              </div>
            </div>
          </div>

          {/* Pitch */}
          <div className="hidden max-w-xl lg:block">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E7C66]">
              {t("login.pitchEyebrow")}
            </p>
            <h2 className="mt-4 text-[2.6rem] font-bold leading-[1.14] tracking-tight text-[#113B32] xl:text-[2.75rem]">
              {t("login.pitchTitle")}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-500">
              {t("login.pitchDesc")}
            </p>
            <ul className="mt-8 space-y-3.5">
              {(["point1", "point2", "point3"] as const).map((k) => (
                <li
                  key={k}
                  className="flex items-center gap-3 rounded-xl bg-[#EAF5F0] px-5 py-[18px]"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#0E7C66]" />
                  <span className="text-[15px] font-medium text-[#123B32]">
                    {t(`login.${k}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>

      {/* Footer band */}
      <footer className="flex flex-col items-center justify-between gap-3 bg-[#0B3B31] px-6 py-[28px] text-sm text-white/80 sm:flex-row lg:px-10">
        <div className="flex items-center gap-3">
          <span className="h-5 w-1.5 rounded-full bg-[#2FBF8F]" />
          <span>{t("login.footerTag")}</span>
        </div>
        <div className="flex items-center gap-8">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="transition-colors hover:text-white"
          >
            {t("login.privacy")}
          </a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="transition-colors hover:text-white"
          >
            {t("login.support")}
          </a>
        </div>
      </footer>
    </div>
  );
}
