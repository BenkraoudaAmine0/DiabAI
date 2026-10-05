"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, Languages, LockKeyhole, MessageCircle, Pencil, X } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { LangToggle, useI18n } from "@/i18n";
import { initials } from "@/lib/clinical";
import { readFriendly, writeFriendly } from "@/lib/patient";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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
      <span
        className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${on ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

/** Name / phone (the columns 0008 lets a user edit) + optional new password. */
function EditProfileDialog({ onClose }: { onClose: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    try {
      const { error: upErr } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
        .eq("id", profile.id);
      if (upErr) throw upErr;
      if (password) {
        const { error: pwErr } = await supabase.auth.updateUser({ password });
        if (pwErr) throw pwErr;
      }
      await refreshProfile();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const input =
    "h-11 w-full rounded-xl border border-pt-border bg-white px-3 text-sm text-pt-ink outline-none focus:border-pt-primary focus:ring-2 focus:ring-pt-mint";
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
          <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-pt-ink">
          <span>{t("common.phone")}</span>
          <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-pt-ink">
          <span>{t("pt.set.newPassword")}</span>
          <input
            className={input}
            type="password"
            value={password}
            minLength={8}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-pt-muted hover:bg-pt-cream">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-xl bg-pt-primary px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Figma 06 Patient Screens · Settings (122:17310). */
export default function PatientSettingsPage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [friendly, setFriendly] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // stored per browser: read it after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFriendly(readFriendly());
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[32px] font-bold leading-[1.15] text-pt-ink">{t("pt.set.title")}</h1>
        <p className="text-[15px] leading-[1.45] text-pt-muted">{t("pt.set.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        {/* profile */}
        <div className="flex items-center gap-4 overflow-hidden rounded-2xl bg-pt-deep p-5">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-pt-mint text-xl font-bold text-pt-deep">
            {initials(profile?.full_name ?? profile?.email)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-xl font-bold text-white">{profile?.full_name ?? "—"}</p>
            <p className="truncate text-xs text-white/72">{profile?.phone || profile?.email}</p>
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

        {/* language */}
        <div className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-pt-border bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pt-mint text-pt-deep">
              <Languages size={20} strokeWidth={1.75} />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-base font-bold text-pt-ink">{t("pt.set.language")}</p>
              <p className="text-xs text-pt-muted">{t("pt.set.languageDesc")}</p>
            </div>
          </div>
          <LangToggle />
        </div>

        {/* chatbot preference */}
        <div className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-pt-border bg-white p-5">
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
      </div>

      <p className="flex items-center gap-2 overflow-hidden rounded-xl bg-pt-mint-soft p-3 text-xs leading-[1.4] text-pt-muted">
        <LockKeyhole size={18} className="shrink-0 text-pt-deep" />
        {t("pt.set.privacy")}
      </p>

      {editing && <EditProfileDialog onClose={() => setEditing(false)} />}
    </div>
  );
}
