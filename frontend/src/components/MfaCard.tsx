"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { useI18n } from "@/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface Factor {
  id: string;
  status: string;
  factor_type?: string;
  friendly_name?: string;
  created_at?: string;
}

/** Two-factor authentication with Supabase Auth TOTP (Google Authenticator,
 *  Authy…): enrol → scan QR → verify a code; or remove the factor. The
 *  backend then requires aal2 tokens for this account (app/auth.py). */
export default function MfaCard() {
  const { t } = useI18n();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient().auth.mfa.listFactors();
    if (error) {
      setFactors([]);
      return;
    }
    // `all`, not `totp`: the totp list holds verified factors only, and a
    // half-finished enrolment must be found to be cleaned up
    setFactors(((data?.all ?? []) as Factor[]).filter((f) => f.factor_type === "totp"));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from Supabase Auth
    load();
  }, [load]);

  const verified = factors?.find((f) => f.status === "verified");

  async function start() {
    setBusy(true);
    setMsg(null);
    const supabase = getSupabaseBrowserClient();
    // remove a half-finished enrolment first, otherwise Supabase refuses a
    // new one with the same name — from a fresh list, as the state predates it
    const { data: listed } = await supabase.auth.mfa.listFactors();
    for (const f of (listed?.all ?? []) as Factor[]) {
      if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "DiabAI" });
    setBusy(false);
    if (error || !data) {
      setMsg({ ok: false, text: error?.message ?? t("common.error") });
      return;
    }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true);
    setMsg(null);
    const { error } = await getSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: t("mfa.badCode") });
      return;
    }
    setEnroll(null);
    setCode("");
    setMsg({ ok: true, text: t("mfa.enabled") });
    load();
  }

  async function cancel() {
    const pending = enroll;
    setEnroll(null);
    setCode("");
    if (pending) await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId: pending.id });
  }

  async function remove() {
    if (!verified || !window.confirm(t("mfa.confirmRemove"))) return;
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId: verified.id });
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t("mfa.removed") });
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base font-bold text-slate-900">{t("mfa.title")}</p>
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {enroll ? (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR as an SVG data URL
            <img src={enroll.qr} alt={t("mfa.qrAlt")} className="size-20" />
          ) : (
            <ShieldCheck size={28} className={verified ? "text-brand" : "text-slate-300"} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm font-semibold text-slate-900">
            {verified ? t("mfa.on") : enroll ? t("mfa.scan") : t("mfa.secure")}
          </p>
          <p className="text-xs text-slate-500">
            {enroll ? (
              <>
                {t("mfa.manual")} <code className="break-all font-mono text-slate-700">{enroll.secret}</code>
              </>
            ) : (
              t("mfa.desc")
            )}
          </p>
        </div>
      </div>
      {enroll ? (
        <form onSubmit={verify} className="flex flex-wrap items-center gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            aria-label={t("mfa.code")}
            className="w-32 rounded-lg border border-slate-200 p-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          <button type="submit" disabled={busy || code.length !== 6} className="rounded-lg bg-brand px-5 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
            {t("mfa.activate")}
          </button>
          <button type="button" onClick={cancel} className="px-2 text-sm font-semibold text-slate-500">
            {t("common.cancel")}
          </button>
        </form>
      ) : verified ? (
        <button type="button" onClick={remove} disabled={busy} className="w-fit rounded-md border border-status-critical px-4 py-2 text-xs font-bold text-status-critical hover:bg-red-50 disabled:opacity-50">
          {t("mfa.remove")}
        </button>
      ) : (
        <button type="button" onClick={start} disabled={busy || factors === null} className="w-fit rounded-md bg-[#e6f2eb] px-4 py-2 text-[13px] font-bold text-brand hover:opacity-90 disabled:opacity-50">
          {t("mfa.start")}
        </button>
      )}
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-[13px] ${msg.ok ? "bg-[#dcfce7] text-status-normal" : "bg-red-50 text-red-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}
