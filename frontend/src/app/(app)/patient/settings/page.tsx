"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, Download, Languages, LockKeyhole, Mail, MessageCircle, Pencil, Phone, ShieldCheck, Stethoscope, Trash2, X, type LucideIcon } from "lucide-react";

import MfaCard from "@/components/MfaCard";
import { useAuth } from "@/contexts/AuthContext";
import { usePatientSummary } from "@/hooks/usePatientSummary";
import { LangToggle, useI18n } from "@/i18n";
import { api, downloadFile } from "@/lib/api";
import { initials } from "@/lib/clinical";
import { readFriendly, shortDate, writeFriendly } from "@/lib/patient";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const card = "flex flex-col gap-4 overflow-hidden rounded-2xl border border-pt-border bg-white p-5";
const input =
  "h-11 w-full rounded-xl border border-pt-border bg-white px-3 text-sm text-pt-ink outline-none focus:border-pt-primary focus:ring-2 focus:ring-pt-mint";

interface DeletionRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

function CardTitle({ icon: IconCmp, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pt-mint text-pt-deep">
        <IconCmp size={20} strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-base font-bold text-pt-ink">{title}</p>
        {text && <p className="text-xs text-pt-muted">{text}</p>}
      </div>
    </div>
  );
}

/** Figma "Toggle on": 48×28 track, #0b6b5f when on. */
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-pt-primary" : "bg-pt-border"}`}
    >
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

function Notice({ ok, text }: { ok: boolean; text: string }) {
  return <p className={`rounded-xl px-3 py-2 text-sm ${ok ? "bg-pt-mint-soft text-pt-deep" : "bg-red-50 text-red-600"}`}>{text}</p>;
}

/** Name, phone, date of birth and sex — the columns a user may edit on
 *  their own profile (migration 0008 column grants). */
function EditProfileDialog({ onClose }: { onClose: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [dob, setDob] = useState(profile?.dob ?? "");
  const [sex, setSex] = useState<"" | "male" | "female">(profile?.sex ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const { error: upErr } = await getSupabaseBrowserClient()
        .from("profiles")
        .update({ full_name: fullName.trim() || null, phone: phone.trim() || null, dob: dob || null, sex: sex || null })
        .eq("id", profile.id);
      if (upErr) throw upErr;
      await refreshProfile();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-pt-ink/40 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form onSubmit={save} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-pt-ink">{t("pt.set.edit")}</h2>
          <button type="button" onClick={onClose} aria-label={t("common.cancel")} className="rounded-lg p-1.5 text-pt-muted hover:bg-pt-cream">
            <X size={18} />
          </button>
        </div>
        <label className="block space-y-1.5 text-sm font-medium text-pt-ink">
          <span>{t("common.fullName")}</span>
          <input className={input} value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-pt-ink">
          <span>{t("common.phone")}</span>
          <input className={input} value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5 text-sm font-medium text-pt-ink">
            <span>{t("pt.res.dob")}</span>
            <input className={input} type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={dob} onChange={(e) => setDob(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-pt-ink">
            <span>{t("pt.res.sex")}</span>
            <select className={input} value={sex} onChange={(e) => setSex(e.target.value as "" | "male" | "female")}>
              <option value="">—</option>
              <option value="female">{t("common.female")}</option>
              <option value="male">{t("common.male")}</option>
            </select>
          </label>
        </div>
        {error && <Notice ok={false} text={error} />}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-pt-muted hover:bg-pt-cream">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={busy} className="h-11 rounded-xl bg-pt-primary px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {busy ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function PasswordForm() {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMsg({ ok: false, text: t("pt.set.pwMismatch") });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setPassword("");
    setConfirm("");
    setMsg({ ok: true, text: t("pt.set.pwChanged") });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <p className="text-sm font-bold text-pt-ink">{t("pt.set.password")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className={input}
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder={t("pt.set.newPassword")}
          aria-label={t("pt.set.newPassword")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className={input}
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder={t("pt.set.confirmPassword")}
          aria-label={t("pt.set.confirmPassword")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {msg && <Notice ok={msg.ok} text={msg.text} />}
      <button type="submit" disabled={busy} className="h-11 w-fit rounded-xl bg-pt-primary px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
        {busy ? t("common.loading") : t("pt.set.changePassword")}
      </button>
    </form>
  );
}

function PrivacyCard() {
  const { t, lang } = useI18n();
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ deletion_request: DeletionRequest | null }>("/api/me")
      .then((r) => setRequest(r.deletion_request))
      .catch(() => setRequest(null));
  }, []);

  async function exportData() {
    setMsg(null);
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
      const r = await api<DeletionRequest>("/api/me/deletion-request", { method: "POST", body: JSON.stringify({ reason }) });
      setRequest(r);
      setMsg({ ok: true, text: t("ds.deleteSent") });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    }
  }

  return (
    <div className={card}>
      <CardTitle icon={LockKeyhole} title={t("pt.set.privacyTitle")} text={t("pt.set.privacyText")} />
      {request && (
        <p className="text-sm font-semibold text-[#a96312]">
          {t("ds.deleteStatus", { status: t(`ds.req.${request.status}`) })} · {shortDate(request.created_at, lang)}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={exportData} className="flex h-11 items-center gap-2 rounded-xl bg-pt-primary px-5 text-sm font-semibold text-white hover:opacity-90">
          <Download size={16} />
          {t("ds.export")}
        </button>
        <button
          type="button"
          onClick={requestDeletion}
          disabled={request?.status === "pending"}
          className="flex h-11 items-center gap-2 rounded-xl border border-red-300 px-5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 size={16} />
          {t("pt.set.deleteAccount")}
        </button>
      </div>
      {msg && <Notice ok={msg.ok} text={msg.text} />}
    </div>
  );
}

/** Patient settings: profile, security (password, 2FA), privacy & data,
 *  language, chat and notification preferences, care team. */
export default function PatientSettingsPage() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const { summary } = usePatientSummary();
  const [friendly, setFriendly] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // stored per browser: read it after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFriendly(readFriendly());
  }, []);

  const details = [
    profile?.email,
    profile?.phone,
    profile?.dob ? shortDate(profile.dob, lang) : null,
    profile?.sex ? t(profile.sex === "male" ? "common.male" : "common.female") : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[32px] font-bold leading-[1.15] text-pt-ink">{t("pt.set.title")}</h1>
        <p className="text-[15px] leading-[1.45] text-pt-muted">{t("pt.set.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* profile */}
          <div className="flex items-center gap-4 overflow-hidden rounded-2xl bg-pt-deep p-5">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-pt-mint text-xl font-bold text-pt-deep">
              {initials(profile?.full_name ?? profile?.email)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate text-xl font-bold text-white">{profile?.full_name ?? "—"}</p>
              <p className="truncate text-xs text-white/72">{details.join(" · ")}</p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t("pt.set.edit")}
              title={t("pt.set.edit")}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.09] text-white hover:bg-white/15"
            >
              <Pencil size={17} />
            </button>
          </div>

          {/* security */}
          <div className={card}>
            <CardTitle icon={ShieldCheck} title={t("pt.set.security")} text={t("pt.set.securityText")} />
            <PasswordForm />
            <div className="border-t border-pt-border pt-4">
              <MfaCard />
            </div>
          </div>

          <PrivacyCard />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {/* language */}
          <div className={card}>
            <CardTitle icon={Languages} title={t("pt.set.language")} text={t("pt.set.languageDesc")} />
            <LangToggle />
          </div>

          {/* chat + notifications */}
          <div className={card}>
            <p className="text-base font-bold text-pt-ink">{t("pt.set.chatbot")}</p>
            <div className="flex items-center gap-3 rounded-xl border border-pt-border bg-white p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pt-mint text-pt-deep">
                <MessageCircle size={20} strokeWidth={1.75} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-[15px] font-bold text-pt-ink">{t("pt.set.friendly")}</p>
                <p className="text-xs leading-[1.35] text-pt-muted">{t("pt.set.friendlyDesc")}</p>
              </div>
              <Toggle
                on={friendly}
                label={t("pt.set.friendly")}
                onChange={(v) => {
                  setFriendly(v);
                  writeFriendly(v);
                }}
              />
            </div>
            <Link
              href="/patient/notifications"
              className="flex items-center gap-3 rounded-xl border border-pt-border bg-white p-3 transition-colors hover:border-pt-primary/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pt-mint text-pt-deep">
                <Bell size={20} strokeWidth={1.75} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[15px] font-bold text-pt-ink">{t("pt.set.notifications")}</span>
                <span className="text-xs leading-[1.35] text-pt-muted">{t("pt.set.notificationsDesc")}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-pt-deep" />
            </Link>
          </div>

          {/* care team */}
          <div className={card}>
            <CardTitle icon={Stethoscope} title={t("pt.home.careTeam")} text={t("pt.set.careTeamText")} />
            {summary && summary.doctors.length === 0 && <p className="text-sm text-pt-muted">{t("pt.home.noCareTeam")}</p>}
            {summary?.doctors.map((d) => (
              <div key={d.id} className="flex flex-col gap-1.5 rounded-xl bg-pt-mint-soft p-3">
                <p className="text-sm font-bold text-pt-ink">Dr. {d.full_name ?? "—"}</p>
                {d.email && (
                  <a href={`mailto:${d.email}`} className="flex items-center gap-2 text-xs text-pt-primary hover:underline">
                    <Mail size={14} /> {d.email}
                  </a>
                )}
                {d.phone && (
                  <a href={`tel:${d.phone}`} className="flex items-center gap-2 text-xs text-pt-primary hover:underline">
                    <Phone size={14} /> {d.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && <EditProfileDialog onClose={() => setEditing(false)} />}
    </div>
  );
}
