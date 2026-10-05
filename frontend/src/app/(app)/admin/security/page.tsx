"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, KeyRound, LogIn, Minus, Monitor, ShieldCheck, ShieldEllipsis, TriangleAlert } from "lucide-react";

import { Notice, PageHeading, Panel, StateBox, StatusPill, SummaryCard, TONES, useAdminApi, type Tone } from "@/components/admin/ui";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { type SecurityResponse, timeAgo } from "@/lib/admin";
import type { Role } from "@/lib/types";

const ROLE_ORDER: Role[] = ["admin", "doctor", "patient"];

// What each role can do in this app (backend guards: require_admin,
// require_doctor + panel links, own-data endpoints).
const MATRIX: { key: string; roles: Record<Role, boolean> }[] = [
  { key: "users", roles: { admin: true, doctor: false, patient: false } },
  { key: "records", roles: { admin: true, doctor: true, patient: false } },
  { key: "ai", roles: { admin: true, doctor: true, patient: false } },
  { key: "kb", roles: { admin: true, doctor: false, patient: false } },
  { key: "audit", roles: { admin: true, doctor: false, patient: false } },
  { key: "own", roles: { admin: true, doctor: true, patient: true } },
];

const FINDING_TONE: Record<string, Tone> = { high: "red", medium: "amber", low: "slate" };
const FINDING_LINK: Record<string, string> = {
  admins_without_2fa: "/admin/users",
  doctors_without_2fa: "/admin/users",
  unverified_doctors: "/admin/doctors",
  pending_deletions: "/admin/users",
  stale_invites: "/admin/users",
};

function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-adm-teal" : "bg-adm-border"}`}
    >
      <span className={`absolute top-[3px] size-[18px] rounded-full bg-white shadow transition-all ${on ? "left-[17px]" : "left-[3px]"}`} />
    </button>
  );
}

/** Figma 05 Admin Screens · Access & security (109:31809). */
export default function AdminSecurityPage() {
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useAdminApi<SecurityResponse>("/api/admin/security");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function setPolicy(value: boolean) {
    if (value && !window.confirm(t("adm.sec.confirmPolicy"))) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/security/settings", { method: "PUT", body: JSON.stringify({ require_mfa_privileged: value }) });
      setMsg({ ok: true, text: t(value ? "adm.sec.policyOn" : "adm.sec.policyOff") });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    } finally {
      setBusy(false);
    }
  }

  const k = data?.kpis;
  return (
    <>
      <PageHeading title={t("adm.sec.title")} subtitle={t("adm.sec.subtitle")} onRefresh={reload} />
      {error && <StateBox kind="error" message={error} onRetry={reload} />}
      {loading && <StateBox kind="loading" />}

      {k && data && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <SummaryCard icon={ShieldCheck} value={k.adoption_pct == null ? "—" : `${k.adoption_pct}%`} label={t("adm.sec.adoption")} />
            <SummaryCard icon={KeyRound} value={k.privileged} label={t("adm.sec.privileged")} tone="green" />
            <SummaryCard icon={LogIn} value={k.signed_in_24h} label={t("adm.sec.signins24h")} tone="blue" />
            <SummaryCard icon={TriangleAlert} value={k.findings} label={t("adm.sec.findings")} tone="amber" />
          </div>
          {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}

          <div className="grid grid-cols-1 items-start gap-[14px] xl:grid-cols-2">
            <div className="flex flex-col gap-[14px]">
              <Panel title={t("adm.sec.roles")} aside={t("adm.sec.builtIn", { n: ROLE_ORDER.length })}>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.44px] text-adm-muted">
                      <th className="py-2 font-semibold">{t("adm.sec.colRole")}</th>
                      <th className="py-2 font-semibold">{t("adm.sec.colMembers")}</th>
                      <th className="py-2 font-semibold">2FA</th>
                      <th className="py-2 font-semibold">{t("adm.sec.colScope")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROLE_ORDER.map((r) => (
                      <tr key={r} className="h-[38px] border-t border-adm-border">
                        <td className="font-semibold text-adm-ink">{t(`role.${r}`)}</td>
                        <td className="text-adm-muted">{t("adm.sec.members", { n: data.roles[r]?.members ?? 0 })}</td>
                        <td className="text-adm-muted">{data.auth_available ? `${data.roles[r]?.with_2fa ?? 0}/${data.roles[r]?.members ?? 0}` : "—"}</td>
                        <td className="text-adm-muted">{t(`adm.sec.scope.${r}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>

              <Panel
                title={t("adm.sec.mfa")}
                aside={
                  data.settings.require_mfa_privileged ? (
                    <StatusPill tone="green">{t("adm.sec.enforced")}</StatusPill>
                  ) : (
                    <StatusPill tone="slate">{t("adm.sec.optional")}</StatusPill>
                  )
                }
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[13px] font-semibold text-adm-ink">{t("adm.sec.requireMfa")}</p>
                    <p className="text-[11px] text-adm-muted">{t("adm.sec.requireMfaSub", { n: k.privileged })}</p>
                  </div>
                  <Toggle
                    on={data.settings.require_mfa_privileged}
                    disabled={busy || (!data.settings.require_mfa_privileged && !data.me_has_2fa)}
                    onChange={setPolicy}
                    label={t("adm.sec.requireMfa")}
                  />
                </div>
                {!data.me_has_2fa && (
                  <p className="text-[11px] text-adm-amber">
                    {t("adm.sec.needOwnMfa")}{" "}
                    <Link href="/doctor/settings?tab=security" className="font-semibold underline">
                      {t("adm.sec.openSettings")}
                    </Link>
                  </p>
                )}
                <div className="flex items-center justify-between gap-4 border-t border-adm-border pt-3">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[13px] font-semibold text-adm-ink">{t("adm.sec.sms")}</p>
                    <p className="text-[11px] text-adm-muted">{t("adm.sec.smsSub")}</p>
                  </div>
                  <Toggle on={false} disabled onChange={() => {}} label={t("adm.sec.sms")} />
                </div>
              </Panel>

              <Panel title={t("adm.sec.findingsTitle")}>
                {data.findings.every((f) => !f.count) && (
                  <div className="flex items-center gap-3 rounded-[10px] bg-adm-green-bg p-3 text-xs font-semibold text-adm-green">
                    <CircleCheck size={18} />
                    {t("adm.sec.noFindings")}
                  </div>
                )}
                {data.findings
                  .filter((f) => f.count)
                  .map((f) => (
                    <Link key={f.code} href={FINDING_LINK[f.code] ?? "/admin/users"} className="flex items-center gap-3 rounded-[10px] px-1 py-1.5 hover:bg-adm-soft">
                      <span className={`h-7 w-[3px] rounded-full ${TONES[FINDING_TONE[f.level]].bar}`} aria-hidden />
                      <span className="flex-1 text-xs text-adm-ink">{t(`adm.sec.f.${f.code}`, { n: f.count ?? 0 })}</span>
                      <StatusPill tone={FINDING_TONE[f.level]}>{t(`adm.al.lv.${f.level}`)}</StatusPill>
                    </Link>
                  ))}
              </Panel>
            </div>

            <div className="flex flex-col gap-[14px]">
              <Panel title={t("adm.sec.matrix")} aside={t("adm.sec.rbac")}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[380px] text-left text-xs">
                    <thead>
                      <tr className="bg-adm-soft text-[11px] text-adm-muted">
                        <th className="px-2 py-2 font-semibold">{t("adm.sec.permission")}</th>
                        {ROLE_ORDER.map((r) => (
                          <th key={r} className="px-2 py-2 text-center font-semibold">
                            {t(`role.${r}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MATRIX.map((row) => (
                        <tr key={row.key} className="h-[39px] border-t border-adm-border">
                          <td className="px-2 text-adm-ink">{t(`adm.sec.perm.${row.key}`)}</td>
                          {ROLE_ORDER.map((r) => (
                            <td key={r} className="px-2 text-center">
                              {row.roles[r] ? (
                                <CircleCheck size={16} className="inline text-adm-green" aria-label="✓" />
                              ) : (
                                <Minus size={16} className="inline text-adm-muted" aria-label="—" />
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-adm-muted">{t("adm.sec.matrixNote")}</p>
              </Panel>

              <Panel title={t("adm.sec.signins")} aside={<Link href="/admin/users" className="hover:text-adm-ink">{t("adm.sec.manageUsers")}</Link>}>
                {data.signins.length === 0 && <StateBox kind="empty" message={t("adm.sec.noSignins")} />}
                {data.signins.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-1">
                    <span className="flex size-[30px] items-center justify-center rounded-lg bg-adm-soft text-adm-muted">
                      <Monitor size={15} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="truncate text-xs font-semibold text-adm-ink">{s.name ?? "—"}</p>
                      <p className="text-[11px] text-adm-muted">{t(`role.${s.role}`)}</p>
                    </div>
                    <span className="text-[11px] text-adm-muted">{timeAgo(s.at, lang)}</span>
                  </div>
                ))}
                <p className="flex items-center gap-1.5 text-[11px] text-adm-muted">
                  <ShieldEllipsis size={12} />
                  {t("adm.sec.sessionsNote")}
                </p>
              </Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}
