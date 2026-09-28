"use client";

import { useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const { error: err } =
        await getSupabaseBrowserClient().auth.updateUser({ password });
      if (err) setError(err.message);
      else {
        setMsg(t("profile.updated"));
        setPassword("");
      }
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t("profile.title")}</h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <dl className="space-y-4">
          <div>
            <dt className="text-xs text-slate-400">{t("common.fullName")}</dt>
            <dd className="font-medium text-slate-800">
              {profile?.full_name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">{t("common.email")}</dt>
            <dd className="font-medium text-slate-800">{profile?.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">{t("profile.role")}</dt>
            <dd>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                {t(
                  profile?.role === "patient"
                    ? "role.patient"
                    : profile?.role === "admin"
                      ? "role.admin"
                      : "role.doctor"
                )}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <form
        onSubmit={changePassword}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="font-semibold text-slate-900">
          {t("profile.changePassword")}
        </h2>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("profile.newPassword")}
          className={inputCls}
        />
        {msg && (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {msg}
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? t("auth.working") : t("profile.update")}
        </button>
      </form>
    </div>
  );
}
