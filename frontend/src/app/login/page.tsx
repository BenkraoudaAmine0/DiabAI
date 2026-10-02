"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Logo from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { LangToggle, useI18n } from "@/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const inputCls =
  "w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

function LoginForm() {
  const { t } = useI18n();
  const { refreshProfile } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
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
            : authError.message.includes("Email not confirmed")
              ? t("auth.notConfirmed")
              : authError.message
        );
        return;
      }
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
    } catch (err) {
      // e.g. Supabase not configured, or unreachable
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // same landing as invitations: /auth/callback exchanges the code,
      // then /set-password asks for the new password
      const { error: err } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/auth/callback?next=/set-password` }
      );
      if (err) setError(err.message);
      else setSentTo(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (mode === "forgot") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{t("auth.forgotTitle")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("auth.forgotDesc")}</p>
        {sentTo ? (
          <p className="mt-6 rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-700">
            {t("auth.linkSent", { email: sentTo })}
          </p>
        ) : (
          <form onSubmit={sendReset} className="mt-6 space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("common.email")}
              className={inputCls}
            />
            {error && (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {busy ? t("auth.working") : t("auth.sendLink")}
            </button>
          </form>
        )}
        <button
          onClick={() => {
            setMode("login");
            setSentTo(null);
            setError(null);
          }}
          className="mt-6 w-full text-center text-sm font-semibold text-teal-600"
        >
          ← {t("auth.backToLogin")}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">
        {t("auth.loginTitle")}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {t("auth.loginSubtitle")}
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("common.email")}
          className={inputCls}
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("common.password")}
          className={inputCls}
        />
        <div className="text-right">
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setError(null);
            }}
            className="text-xs font-semibold text-teal-600 hover:text-teal-800"
          >
            {t("auth.forgot")}
          </button>
        </div>
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
          {busy ? t("auth.working") : t("common.login")}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        {t("auth.noAccount")}{" "}
        <Link href="/register" className="font-semibold text-teal-600">
          {t("common.register")}
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <LangToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size={44} />
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
