"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { DropletLogo, SegmentedLangToggle } from "@/components/Brand";
import { useI18n } from "@/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

const inputClass =
  "w-full rounded-[10px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#0E7C66] focus:ring-2 focus:ring-[#0E7C66]/15";

function RegisterForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<Role>(
    params.get("role") === "doctor" ? "doctor" : "patient"
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role, full_name: fullName },
        },
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      // If email confirmation is disabled in the project, a session is
      // returned immediately — send the user straight in.
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        router.push(role === "doctor" ? "/doctor/dashboard" : "/patient");
        return;
      }
      setDone(true);
    } catch (err) {
      // e.g. Supabase not configured, or unreachable
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1240px] items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-16">
      {/* Form card */}
      <div className="rounded-3xl bg-white p-7 shadow-[0_24px_60px_-28px_rgba(11,59,49,0.28)] sm:p-10">
        {done ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-[#113B32]">
              {t("auth.registerTitle")}
            </h1>
            <p className="mt-4 rounded-lg bg-[#EAF5F0] px-4 py-3 text-sm text-[#0B4F41]">
              {t("auth.checkEmail")}
            </p>
            <Link
              href="/login"
              className="mt-5 block w-full rounded-xl bg-[#0E7C66] px-4 py-3.5 text-center text-[15px] font-semibold text-white transition-colors hover:bg-[#0B6455]"
            >
              {t("common.login")}
            </Link>
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E7C66]">
              {t("auth.registerEyebrow")}
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#113B32]">
              {t("auth.registerTitle")}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
              {t("auth.registerSubtitle")}
            </p>

            <p className="mb-2.5 mt-7 block text-sm font-semibold text-slate-800">
              {t("auth.asLabel")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["doctor", "patient"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    role === r
                      ? "border-[#0E7C66] bg-[#EAF5F0] ring-1 ring-[#0E7C66]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      role === r
                        ? "border-[#0E7C66]"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {role === r && (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#0E7C66]" />
                    )}
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold text-[#123B32]">
                      {t(`auth.role${r === "doctor" ? "Doctor" : "Patient"}`)}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">
                      {t(
                        `auth.role${r === "doctor" ? "Doctor" : "Patient"}Desc`
                      )}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="reg-name"
                  className="mb-1.5 block text-sm font-semibold text-slate-800"
                >
                  {t("common.fullName")}
                </label>
                <input
                  id="reg-name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("register.namePlaceholder")}
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="reg-email"
                  className="mb-1.5 block text-sm font-semibold text-slate-800"
                >
                  {t("login.emailLabel")}
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("register.emailPlaceholder")}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="reg-password"
                  className="mb-1.5 block text-sm font-semibold text-slate-800"
                >
                  {t("register.passwordLabel")}
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("register.passwordPlaceholder")}
                  className={inputClass}
                />
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 sm:col-span-2">
                <input
                  type="checkbox"
                  required
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#0E7C66]"
                />
                <span className="text-[13px] leading-snug text-slate-600">
                  {t("auth.terms")}
                </span>
              </label>

              {error && (
                <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 sm:col-span-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-[#0E7C66] px-4 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#0B6455] disabled:opacity-50 sm:col-span-2"
              >
                {busy ? t("auth.working") : t("auth.registerCta")}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Aside */}
      <div className="lg:pt-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E7C66]">
          {t("auth.stepsEyebrow")}
        </p>
        <h2 className="mt-3 text-[2.1rem] font-bold leading-[1.15] tracking-tight text-[#113B32]">
          {t("auth.stepsTitle")}
        </h2>
        <ul className="mt-7 space-y-3.5">
          {(["step1", "step2", "step3"] as const).map((k, i) => (
            <li
              key={k}
              className="flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white px-5 py-4"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#DFEFE8] text-[13px] font-bold text-[#0B4F41]">
                {i + 1}
              </span>
              <span className="text-[15px] font-medium text-[#123B32]">
                {t(`auth.${k}`)}
              </span>
            </li>
          ))}
        </ul>

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
              {t("auth.registerTrustTitle")}
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">
              {t("auth.registerTrustDesc")}
            </p>
          </div>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          {t("auth.helpLabel")}{" "}
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="font-semibold text-[#0E7C66] hover:underline"
          >
            {t("auth.helpLink")}
          </a>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const { t } = useI18n();
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
            href="/login"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            {t("common.login")}
          </Link>
        </div>
      </header>

      {/* Body */}
      <main className="flex flex-1 items-center px-6 py-10 lg:px-10">
        <Suspense
          fallback={
            <p className="w-full text-center text-sm text-slate-500">
              {t("common.loading")}
            </p>
          }
        >
          <RegisterForm />
        </Suspense>
      </main>

      {/* Footer band — pinned to the bottom of the page */}
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
            {t("landing.bandTerms")}
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
