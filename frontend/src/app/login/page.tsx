"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import PublicShell, { PrivacyNote, pubEyebrow, pubInput, pubLabel, pubPrimary } from "@/components/public/PublicShell";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** The verified TOTP factor to ask a code for, when the session is still
 *  at aal1 but the account has 2FA (Supabase Auth MFA); else null. */
async function pendingFactor(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!data || data.nextLevel !== "aal2" || data.currentLevel === "aal2") return null;
  const { data: factors } = await supabase.auth.mfa.listFactors();
  return factors?.totp?.[0]?.id ?? null; // `totp` lists verified factors only
}

const cardCls =
  "flex w-full max-w-[520px] shrink-0 flex-col gap-6 rounded-[28px] border border-pub-line bg-white p-6 shadow-[0_18px_50px_rgba(6,61,48,0.13)] sm:p-10";

function Heading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className={pubEyebrow}>{eyebrow}</p>
      <h1 className="text-[34px] font-bold tracking-[-0.42px] text-pub-dark sm:text-[42px]">{title}</h1>
      <p className="text-base leading-[1.5] text-pub-muted">{text}</p>
    </div>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  return text ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{text}</p> : null;
}

function LoginForm() {
  const { t } = useI18n();
  const { refreshProfile } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "forgot" | "mfa">("login");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // sent back here by the API helper: signed in, but the 2FA code is missing
  useEffect(() => {
    if (params.get("mfa") !== "1") return;
    pendingFactor().then((id) => {
      if (id) {
        setFactorId(id);
        setMode("mfa");
      }
    });
  }, [params]);

  async function finish() {
    const supabase = getSupabaseBrowserClient();
    await refreshProfile();
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .single();
    const next = params.get("next");
    router.push(
      next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : data?.role === "admin"
          ? "/admin/dashboard"
          : data?.role === "doctor"
            ? "/doctor/dashboard"
            : "/patient"
    );
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await getSupabaseBrowserClient().auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (err) {
        setError(t("mfa.badCode"));
        return;
      }
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function otherAccount() {
    await getSupabaseBrowserClient().auth.signOut();
    setMode("login");
    setFactorId(null);
    setCode("");
    setError(null);
    router.replace("/login");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
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
      // accounts with 2FA: the password alone gives an aal1 session
      const id = await pendingFactor();
      if (id) {
        setFactorId(id);
        setMode("mfa");
        return;
      }
      await finish();
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
      const { error: err } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/set-password`,
      });
      if (err) setError(err.message);
      else setSentTo(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const backLink = (onClick: () => void, label: string) => (
    <button type="button" onClick={onClick} className="text-center text-sm font-semibold text-pub-primary hover:underline">
      ← {label}
    </button>
  );

  if (mode === "mfa") {
    return (
      <div className={cardCls}>
        <Heading eyebrow={t("pub.login.eyebrow")} title={t("auth.mfaTitle")} text={t("auth.mfaDesc")} />
        <form onSubmit={verifyCode} className="flex flex-col gap-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            aria-label={t("mfa.code")}
            className={`${pubInput} text-center font-mono text-lg tracking-[0.3em]`}
          />
          <ErrorLine text={error} />
          <button type="submit" disabled={busy || code.length !== 6} className={pubPrimary}>
            {busy ? t("auth.working") : t("auth.mfaVerify")}
          </button>
        </form>
        {backLink(otherAccount, t("auth.mfaOther"))}
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className={cardCls}>
        <Heading eyebrow={t("pub.login.eyebrow")} title={t("auth.forgotTitle")} text={t("auth.forgotDesc")} />
        {sentTo ? (
          <p className="rounded-xl bg-pub-mint-soft px-4 py-3 text-sm text-pub-deep">{t("auth.linkSent", { email: sentTo })}</p>
        ) : (
          <form onSubmit={sendReset} className="flex flex-col gap-4">
            <label className={pubLabel}>
              {t("pub.email")}
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("pub.emailPh")} className={pubInput} />
            </label>
            <ErrorLine text={error} />
            <button type="submit" disabled={busy} className={pubPrimary}>
              {busy ? t("auth.working") : t("auth.sendLink")}
            </button>
          </form>
        )}
        {backLink(() => {
          setMode("login");
          setSentTo(null);
          setError(null);
        }, t("auth.backToLogin"))}
      </div>
    );
  }

  return (
    <div className={cardCls}>
      <Heading eyebrow={t("pub.login.eyebrow")} title={t("pub.login.title")} text={t("pub.login.text")} />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className={pubLabel}>
          {t("pub.email")}
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("pub.emailPh")} className={pubInput} />
        </label>
        <label className={pubLabel}>
          {t("pub.password")}
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("pub.passwordPh")}
            className={pubInput}
          />
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setError(null);
            }}
            className="text-sm font-semibold text-pub-primary hover:underline"
          >
            {t("auth.forgot")}
          </button>
        </div>
        <ErrorLine text={error} />
        <button type="submit" disabled={busy} className={pubPrimary}>
          {busy ? t("auth.working") : t("pub.login.submit")}
        </button>
      </form>
      <p className="flex flex-wrap justify-center gap-2 text-sm">
        <span className="text-pub-muted">{t("pub.login.new")}</span>
        <Link href="/register" className="font-semibold text-pub-primary hover:underline">
          {t("pub.createAccount")}
        </Link>
      </p>
      <PrivacyNote title={t("pub.login.privacyTitle")} text={t("pub.login.privacyText")} />
    </div>
  );
}

/** Figma "Page new" · Login EN (43:367). */
export default function LoginPage() {
  const { t } = useI18n();
  return (
    <PublicShell action={{ href: "/register", label: t("pub.createAccount") }}>
      <div className="flex flex-1 flex-col items-center gap-12 px-4 py-10 sm:px-12 lg:flex-row lg:gap-[72px] lg:px-24 lg:py-[52px]">
        <Suspense>
          <LoginForm />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col gap-8 lg:pl-14 lg:pr-6">
          <div className="flex flex-col gap-4">
            <p className="text-xs font-bold uppercase tracking-[1.2px] text-pub-accent">{t("pub.login.ctxEyebrow")}</p>
            <h2 className="text-3xl font-bold leading-[1.12] tracking-[-0.96px] text-pub-dark sm:text-5xl">{t("pub.login.ctxTitle")}</h2>
            <p className="text-lg leading-[1.6] text-pub-muted">{t("pub.login.ctxText")}</p>
          </div>
          <ul className="flex flex-col gap-3">
            {(["roles", "audit", "support"] as const).map((k) => (
              <li key={k} className="flex items-center gap-3 rounded-xl bg-pub-mint-soft px-4 py-3.5 text-sm font-medium text-pub-ink">
                <span className="size-2.5 shrink-0 rounded-full bg-pub-primary" aria-hidden />
                {t(`pub.login.trust.${k}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PublicShell>
  );
}
