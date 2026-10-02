"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import Logo from "@/components/Logo";
import { LangToggle, useI18n } from "@/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

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

  if (done) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-700">
          {t("auth.checkEmail")}
        </p>
        <Link
          href="/login"
          className="mt-4 block w-full rounded-xl bg-teal-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-teal-700"
        >
          {t("common.login")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">
        {t("auth.registerTitle")}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {t("auth.registerSubtitle")}
      </p>

      {/* role toggle */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        {(["doctor", "patient"] as Role[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              role === r
                ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <p className="font-semibold text-slate-900">
              {t(`auth.role${r === "doctor" ? "Doctor" : "Patient"}`)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {t(`auth.role${r === "doctor" ? "Doctor" : "Patient"}Desc`)}
            </p>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t("common.fullName")}
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("common.email")}
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("common.password")}
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
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
          {busy ? t("auth.working") : t("common.register")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-teal-600">
          {t("common.login")}
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <LangToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Logo size={44} />
          </Link>
        </div>
        <Suspense fallback={<p className="text-center text-sm text-slate-500">{t("common.loading")}</p>}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
