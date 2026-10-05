"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import PublicShell, { PrivacyNote, pubEyebrow, pubInput, pubLabel, pubPrimary } from "@/components/public/PublicShell";
import { useI18n } from "@/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type SignupRole = "doctor" | "patient";

function RoleCard({ role, selected, onSelect }: { role: SignupRole; selected: boolean; onSelect: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-[72px] flex-1 items-center gap-3 rounded-xl p-4 text-left ${
        selected ? "border-2 border-pub-primary bg-pub-mint" : "border border-pub-field bg-white hover:bg-pub-mint-soft"
      }`}
    >
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 bg-white ${selected ? "border-pub-primary" : "border-pub-field"}`}
        aria-hidden
      >
        {selected && <span className="size-2.5 rounded-full bg-pub-primary" />}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-pub-dark">{t(`pub.reg.role.${role}`)}</span>
        <span className="text-xs leading-[1.35] text-pub-muted">{t(`pub.reg.role.${role}Sub`)}</span>
      </span>
    </button>
  );
}

function RegisterForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<SignupRole>(params.get("role") === "doctor" ? "doctor" : "patient");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [license, setLicense] = useState("");
  const [facility, setFacility] = useState("");
  const [dob, setDob] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setError(t("pub.reg.needConsent"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      // the database keeps these on the new profile (migration 0012); the
      // role is limited to doctor/patient there whatever is sent
      const data =
        role === "doctor"
          ? { role, full_name: fullName, phone, license_number: license.trim(), facility: facility.trim() }
          : { role, full_name: fullName, phone, dob };
      const { error: authError } = await supabase.auth.signUp({ email, password, options: { data } });
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

  const card =
    "flex w-full max-w-[820px] min-w-0 flex-col gap-6 rounded-[28px] border border-pub-line bg-white p-6 shadow-[0_18px_25px_rgba(6,61,48,0.13)] sm:p-9";

  if (done) {
    return (
      <div className={card}>
        <p className={pubEyebrow}>{t("pub.reg.eyebrow")}</p>
        <h1 className="text-[34px] font-bold text-pub-dark">{t("pub.reg.doneTitle")}</h1>
        <p className="rounded-xl bg-pub-mint-soft px-4 py-3 text-sm text-pub-deep">{t("auth.checkEmail")}</p>
        <Link href="/login" className={pubPrimary}>
          {t("pub.login")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={card}>
      <div className="flex flex-col gap-3">
        <p className={pubEyebrow}>{t("pub.reg.eyebrow")}</p>
        <h1 className="text-[34px] font-bold tracking-[-0.42px] text-pub-dark sm:text-[42px]">{t("pub.reg.title")}</h1>
        <p className="text-base leading-[1.5] text-pub-muted">{t("pub.reg.text")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-pub-ink">{t("pub.reg.as")}</p>
        <div role="radiogroup" aria-label={t("pub.reg.as")} className="flex flex-col gap-3 sm:flex-row">
          <RoleCard role="doctor" selected={role === "doctor"} onSelect={() => setRole("doctor")} />
          <RoleCard role="patient" selected={role === "patient"} onSelect={() => setRole("patient")} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={pubLabel}>
          {t("pub.reg.fullName")}
          <input required maxLength={120} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("pub.reg.fullNamePh")} className={pubInput} />
        </label>
        <label className={pubLabel}>
          {t("pub.email")}
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.dz" className={pubInput} />
        </label>
        <label className={pubLabel}>
          {t("pub.reg.phone")}
          <input type="tel" maxLength={30} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+213 5 00 00 00 00" className={pubInput} />
        </label>
        <label className={pubLabel}>
          {t("pub.reg.password")}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("pub.reg.passwordPh")}
            className={pubInput}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-pub-ink">{t("pub.reg.specific")}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <fieldset
            disabled={role !== "doctor"}
            className={`flex flex-col gap-3 rounded-xl p-4 ${role === "doctor" ? "border border-pub-primary bg-pub-mint-soft" : "border border-pub-line bg-pub-bg opacity-60"}`}
          >
            <legend className="sr-only">{t("pub.reg.forDoctors")}</legend>
            <div className="flex flex-col gap-1">
              <p className={`text-sm font-bold ${role === "doctor" ? "text-pub-deep" : "text-pub-ink"}`}>{t("pub.reg.forDoctors")}</p>
              <p className="text-xs text-pub-muted">{t("pub.reg.forDoctorsSub")}</p>
            </div>
            <label className={pubLabel}>
              {t("pub.reg.license")}
              <input required={role === "doctor"} maxLength={64} value={license} onChange={(e) => setLicense(e.target.value)} placeholder={t("pub.reg.licensePh")} className={pubInput} />
            </label>
            <label className={pubLabel}>
              {t("pub.reg.facility")}
              <input required={role === "doctor"} maxLength={120} value={facility} onChange={(e) => setFacility(e.target.value)} placeholder={t("pub.reg.facilityPh")} className={pubInput} />
            </label>
          </fieldset>
          <fieldset
            disabled={role !== "patient"}
            className={`flex flex-col gap-3 rounded-xl p-4 ${role === "patient" ? "border border-pub-primary bg-pub-mint-soft" : "border border-pub-line bg-pub-bg opacity-60"}`}
          >
            <legend className="sr-only">{t("pub.reg.forPatients")}</legend>
            <div className="flex flex-col gap-1">
              <p className={`text-sm font-bold ${role === "patient" ? "text-pub-deep" : "text-pub-ink"}`}>{t("pub.reg.forPatients")}</p>
              <p className="text-xs text-pub-muted">{t("pub.reg.forPatientsSub")}</p>
            </div>
            <label className={pubLabel}>
              {t("pub.reg.dob")}
              <input
                type="date"
                required={role === "patient"}
                max={new Date().toISOString().slice(0, 10)}
                min="1900-01-01"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className={pubInput}
              />
            </label>
            <p className="text-xs leading-[1.45] text-pub-muted">{t("pub.reg.patientNote")}</p>
          </fieldset>
        </div>
      </div>

      <label className="flex items-start gap-3 text-sm leading-[1.45] text-pub-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-[18px] shrink-0 rounded border-pub-field accent-pub-primary"
        />
        <span>
          {t("pub.reg.consent")}{" "}
          <Link href="/#privacy" className="font-semibold text-pub-primary hover:underline">
            {t("pub.reg.consentLink")}
          </Link>
        </span>
      </label>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className={pubPrimary}>
        {busy ? t("auth.working") : t("pub.reg.submit")}
      </button>
    </form>
  );
}

/** Figma "Page new" · Register EN (43:195). */
export default function RegisterPage() {
  const { t } = useI18n();
  return (
    <PublicShell action={{ href: "/login", label: t("pub.login") }}>
      <div className="flex flex-col gap-12 px-4 py-10 sm:px-12 lg:flex-row lg:items-start lg:px-20 lg:py-12">
        <Suspense fallback={<p className="text-sm text-pub-muted">{t("common.loading")}</p>}>
          <RegisterForm />
        </Suspense>
        <aside className="flex min-w-0 flex-1 flex-col gap-8 lg:pt-6">
          <div className="flex flex-col gap-4">
            <p className="text-xs font-bold uppercase tracking-[1.2px] text-pub-accent">{t("pub.reg.ctxEyebrow")}</p>
            <h2 className="text-3xl font-bold leading-[1.15] tracking-[-0.4px] text-pub-dark sm:text-[40px]">{t("pub.reg.ctxTitle")}</h2>
          </div>
          <ol className="flex flex-col gap-3">
            {(["one", "two", "three"] as const).map((k, i) => (
              <li key={k} className="flex items-center gap-3 rounded-xl border border-pub-line bg-white p-4">
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-pub-mint text-sm font-bold text-pub-deep">{i + 1}</span>
                <span className="text-sm font-medium leading-[1.4] text-pub-ink">{t(`pub.reg.step.${k}`)}</span>
              </li>
            ))}
          </ol>
          <PrivacyNote title={t("pub.reg.privacyTitle")} text={t("pub.reg.privacyText")} />
          <p className="flex flex-wrap gap-2 text-sm">
            <span className="text-pub-muted">{t("pub.reg.haveAccount")}</span>
            <Link href="/login" className="font-semibold text-pub-primary hover:underline">
              {t("pub.login")}
            </Link>
          </p>
        </aside>
      </div>
    </PublicShell>
  );
}
