"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import MfaCard from "@/components/MfaCard";
import { useAuth } from "@/contexts/AuthContext";
import { LangToggle, useI18n } from "@/i18n";
import { api, downloadFile } from "@/lib/api";
import { initials } from "@/lib/clinical";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Tab = "profile" | "language" | "units" | "security" | "privacy";
const TABS: Tab[] = ["profile", "language", "units", "security", "privacy"];

interface MeResponse {
  profile: { email: string | null; full_name: string | null; specialty?: string | null; license_number?: string | null; facility?: string | null };
  deletion_request: { id: string; status: string; created_at: string } | null;
}

const label = "text-xs font-bold text-slate-500";
const input =
  "w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";
const readonly = "w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500";

/** Figma 02 Doctor Screens · settings (2:3139). */
function SettingsView() {
  // read in the browser: the page is prerendered as static, so the
  // searchParams prop would be empty there
  const params = useSearchParams();
  const query = { tab: params.get("tab") ?? undefined, mfa: params.get("mfa") ?? undefined };
  const { profile, refreshProfile } = useAuth();
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>(() => (TABS.includes(query.tab as Tab) ? (query.tab as Tab) : "profile"));
  const [me, setMe] = useState<MeResponse | null>(null);
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [license, setLicense] = useState("");
  const [facility, setFacility] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function reset(r: MeResponse | null) {
    setFullName(r?.profile.full_name ?? profile?.full_name ?? "");
    setSpecialty(r?.profile.specialty ?? "");
    setLicense(r?.profile.license_number ?? "");
    setFacility(r?.profile.facility ?? "");
    setPassword("");
  }

  useEffect(() => {
    api<MeResponse>("/api/me")
      .then((r) => {
        setMe(r);
        reset(r);
      })
      .catch(() => reset(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/me/professional", {
        method: "PUT",
        body: JSON.stringify({ full_name: fullName, specialty, license_number: license, facility }),
      });
      if (password) {
        const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
        if (error) throw error;
      }
      await refreshProfile();
      setPassword("");
      setMsg({ ok: true, text: t("ds.saved") });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    try {
      await downloadFile("/api/me/export", "diabai-export.json");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    }
  }

  async function requestDeletion() {
    const reason = window.prompt(t("ds.deleteReason"));
    if (reason === null) return;
    try {
      const r = await api<MeResponse["deletion_request"]>("/api/me/deletion-request", {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setMe((m) => (m ? { ...m, deletion_request: r } : m));
      setMsg({ ok: true, text: t("ds.deleteSent") });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    }
  }

  const section = (key: Tab) => tab === key;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] font-extrabold text-slate-900">{t("ds.title")}</h1>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col" aria-label={t("ds.title")}>
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-current={tab === k ? "page" : undefined}
              className={`shrink-0 rounded-lg p-3 text-left text-sm ${tab === k ? "bg-[#e6f2eb] font-bold text-brand" : "font-medium text-slate-700 hover:bg-white"}`}
            >
              {t(`ds.tab.${k}`)}
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          {section("profile") && (
            <div className="flex flex-col gap-4">
              <p className="text-base font-bold text-slate-900">{t("ds.profileTitle")}</p>
              <div className="flex items-center gap-4">
                <span className="flex size-16 items-center justify-center rounded-full bg-slate-100 text-xl font-bold text-slate-600">
                  {initials(fullName || profile?.email)}
                </span>
                <p className="text-xs text-slate-500">{t("ds.avatarNote")}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className={label}>{t("ds.fullName")}</span>
                  <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className={label}>{t("ds.email")}</span>
                  <p className={readonly}>{me?.profile.email ?? profile?.email}</p>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className={label}>{t("ds.specialty")}</span>
                  <input className={input} value={specialty} placeholder={t("ds.specialtyPh")} onChange={(e) => setSpecialty(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={label}>{t("ds.license")}</span>
                  <input className={`${input} font-mono`} value={license} placeholder="DZ-MED-…" onChange={(e) => setLicense(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className={label}>{t("pub.reg.facility")}</span>
                  <input className={input} value={facility} maxLength={120} placeholder={t("pub.reg.facilityPh")} onChange={(e) => setFacility(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className={label}>{t("pt.set.newPassword")}</span>
                  <input className={input} type="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
              </div>
            </div>
          )}

          {section("language") && (
            <div className="flex flex-col gap-4">
              <p className="text-base font-bold text-slate-900">{t("ds.tab.language")}</p>
              <p className="text-sm text-slate-500">{t("ds.languageDesc", { lang: lang.toUpperCase() })}</p>
              <LangToggle />
            </div>
          )}

          {section("units") && (
            <div className="flex flex-col gap-4">
              <p className="text-base font-bold text-slate-900">{t("ds.unitsTitle")}</p>
              <div className="flex flex-wrap gap-6">
                {[
                  ["ds.glucose", "mg/dL"],
                  ["ds.weight", "kg"],
                  ["ds.height", "cm"],
                ].map(([k, unit]) => (
                  <div key={k} className="flex w-[180px] flex-col gap-1.5">
                    <span className={label}>{t(k)}</span>
                    <p className={readonly}>{unit}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">{t("ds.unitsNote")}</p>
            </div>
          )}

          {section("security") && query.mfa === "required" && (
            <p className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[13px] font-semibold text-status-prediabetes">
              {t("ds.mfaRequired")}
            </p>
          )}
          {section("security") && <MfaCard />}

          {section("privacy") && (
            <div className="flex flex-col gap-3 rounded-lg bg-[#e6f2eb] p-5">
              <p className="text-sm font-bold text-brand">{t("ds.lawTitle")}</p>
              <p className="text-xs leading-[18px] text-slate-900">{t("ds.lawText")}</p>
              {me?.deletion_request && (
                <p className="text-xs font-semibold text-status-prediabetes">
                  {t("ds.deleteStatus", { status: t(`ds.req.${me.deletion_request.status}`) })}
                </p>
              )}
              <div className="flex flex-wrap gap-3 pt-2">
                <button type="button" onClick={exportData} className="rounded-md bg-brand px-4 py-2 text-xs font-bold text-white hover:opacity-90">
                  {t("ds.export")}
                </button>
                <button type="button" onClick={requestDeletion} className="rounded-md border border-status-critical px-4 py-2 text-xs font-bold text-status-critical hover:bg-red-50">
                  {t("ds.delete")}
                </button>
              </div>
            </div>
          )}

          {msg && (
            <p className={`rounded-lg px-3 py-2 text-[13px] ${msg.ok ? "bg-[#dcfce7] text-status-normal" : "bg-red-50 text-red-600"}`}>{msg.text}</p>
          )}

          {section("profile") && (
            <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
              <button type="button" onClick={() => reset(me)} className="rounded-lg border border-slate-200 px-6 py-3 text-sm text-slate-700 hover:bg-slate-50">
                {t("common.cancel")}
              </button>
              <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-brand px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
                {busy ? t("auth.working") : t("ds.save")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DoctorSettingsPage() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
