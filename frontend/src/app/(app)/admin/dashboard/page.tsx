"use client";

import Link from "next/link";
import { HeartPulse, History, ShieldAlert, Stethoscope, Users } from "lucide-react";

import { LEVEL_TONE, MODEL_TONE, SERVICE_TONE, actionLine } from "@/components/admin/labels";
import { KpiCard, PageHeading, Panel, StateBox, StatusPill, TONES, card, useAdminApi } from "@/components/admin/ui";
import { useI18n } from "@/i18n";
import { type OverviewResponse, timeAgo } from "@/lib/admin";

/** Figma 05 Admin Screens · Overview (109:29968). */
export default function AdminOverviewPage() {
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useAdminApi<OverviewResponse>("/api/admin/overview");
  const k = data?.kpis;

  return (
    <>
      <PageHeading title={t("adm.ov.title")} subtitle={t("adm.ov.subtitle")} onRefresh={reload} />
      {error && <StateBox kind="error" message={error} onRetry={reload} />}
      {loading && <StateBox kind="loading" />}

      {k && (
        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label={t("adm.ov.kpiUsers")} value={k.users} change={t("adm.ov.kpiUsersSub", { n: k.users_new_week })} icon={Users} tone="teal" />
          <KpiCard
            label={t("adm.ov.kpiDoctors")}
            value={k.doctors}
            change={k.doctors_verified == null ? t("adm.ov.kpiDoctorsNew", { n: k.doctors_new_week }) : t("adm.ov.kpiDoctorsSub", { n: k.doctors_verified })}
            icon={Stethoscope}
            tone="blue"
          />
          <KpiCard
            label={t("adm.ov.kpiPatients")}
            value={k.patients_active_30d ?? k.patients}
            change={
              k.patients_active_30d == null
                ? t("adm.ov.kpiPatientsTotal")
                : t("adm.ov.kpiPatientsSub", { pct: k.patients ? Math.round((100 * k.patients_active_30d) / k.patients) : 0, total: k.patients })
            }
            icon={HeartPulse}
            tone="green"
          />
          <KpiCard label={t("adm.ov.kpiAlerts")} value={k.alerts_open} change={t("adm.ov.kpiAlertsSub", { n: k.alerts_critical })} icon={ShieldAlert} tone="red" />
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 items-start gap-[14px] xl:grid-cols-2">
            <Panel title={t("adm.ov.audit")} aside={<Link href="/admin/audit" className="hover:text-adm-ink">{t("adm.ov.viewAudit")}</Link>}>
              {data.audit.length === 0 && <StateBox kind="empty" message={t("adm.ov.noAudit")} />}
              {data.audit.map((e) => (
                <div key={e.id} className="flex h-[45px] items-center gap-2.5 border-b border-adm-border last:border-b-0">
                  <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-adm-tint text-adm-teal">
                    <History size={15} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <p className="truncate text-xs font-semibold text-adm-ink">{e.actor_name}</p>
                    <p className="truncate text-[11px] text-adm-muted">
                      {actionLine(t, e.action)}
                      {e.target_label ? ` · ${e.target_label}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-adm-muted">{timeAgo(e.created_at, lang)}</span>
                </div>
              ))}
            </Panel>

            <Panel title={t("adm.ov.models")} aside={<Link href="/admin/models" className="hover:text-adm-ink">{t("adm.ov.registry")}</Link>}>
              {data.models.registry.length > 0 ? (
                <>
                  {(() => {
                    const top = data.models.registry[0];
                    return (
                      <div className="flex flex-col gap-2.5 rounded-[10px] bg-adm-tint p-[14px]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-col gap-[3px]">
                            <p className="truncate text-sm font-bold text-adm-ink">{top.name}</p>
                            <p className="text-[11px] text-adm-muted">v{top.version} · {timeAgo(top.updated_at ?? top.created_at, lang)}</p>
                          </div>
                          <StatusPill tone={MODEL_TONE[top.status]}>{t(`adm.mod.st.${top.status}`)}</StatusPill>
                        </div>
                        {Object.keys(top.metrics).length > 0 && (
                          <div className="flex gap-2.5">
                            {Object.entries(top.metrics)
                              .slice(0, 3)
                              .map(([name, v]) => (
                                <div key={name} className="flex flex-1 flex-col gap-[3px]">
                                  <p className="text-[11px] text-adm-muted">{name}</p>
                                  <p className="text-sm font-bold text-adm-ink">{String(v)}</p>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {data.models.registry.slice(1, 3).map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-[7px]">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="truncate text-xs font-semibold text-adm-ink">{m.name}</p>
                        <p className="text-[11px] text-adm-muted">v{m.version}</p>
                      </div>
                      <StatusPill tone={MODEL_TONE[m.status]}>{t(`adm.mod.st.${m.status}`)}</StatusPill>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <p className="text-[11px] text-adm-muted">{t("adm.ov.noModels")}</p>
                  {data.models.detected.map((d) => (
                    <div key={d.key} className="flex items-center justify-between py-[7px]">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="truncate text-xs font-semibold text-adm-ink">{t(`adm.mod.task.${d.task}`)}</p>
                        <p className="truncate font-mono text-[11px] text-adm-muted">{d.artifact}</p>
                      </div>
                      <StatusPill tone="green">{t("adm.mod.loaded")}</StatusPill>
                    </div>
                  ))}
                </>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 items-start gap-[14px] xl:grid-cols-2">
            <Panel title={t("adm.ov.health")} aside={t("adm.ov.checked", { time: timeAgo(data.health.checked_at, lang) })}>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {(
                  [
                    ["api", data.health.services.api.status, data.health.services.api.p95_ms != null ? `${Math.round(data.health.services.api.p95_ms)} ms` : "—"],
                    ["database", data.health.services.database.status, `${Math.round(data.health.services.database.latency_ms)} ms`],
                    ["ml", data.health.services.ml.status, `${data.health.services.ml.loaded}/${data.health.services.ml.total}`],
                  ] as const
                ).map(([name, status, metric]) => (
                  <Link key={name} href="/admin/health" className="flex flex-col gap-[7px] rounded-[10px] bg-adm-soft p-3 hover:bg-adm-tint">
                    <p className="flex items-center gap-[7px] text-xs font-semibold text-adm-ink">
                      <span className={`size-2 rounded-full ${TONES[SERVICE_TONE[status]].dot}`} aria-hidden />
                      {t(`adm.svc.${name}`)}
                    </p>
                    <p className="text-lg font-bold text-adm-ink">{metric}</p>
                    <p className={`text-[11px] ${TONES[SERVICE_TONE[status]].pill.split(" ")[1]}`}>{t(`adm.svcSt.${status}`)}</p>
                  </Link>
                ))}
              </div>
            </Panel>

            <Panel title={t("adm.ov.alerts")} aside={t("adm.ov.unresolved", { n: data.kpis.alerts_open })}>
              {data.alerts.length === 0 && <p className="py-3 text-xs text-adm-muted">{t("adm.ov.noAlerts")}</p>}
              {data.alerts.map((a) => (
                <Link key={a.id} href="/admin/alerts" className="flex items-center gap-[9px] py-[5px]">
                  <span className={`h-7 w-[3px] shrink-0 rounded-full ${TONES[LEVEL_TONE[a.level]].bar}`} aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-xs font-semibold text-adm-ink">{a.message}</p>
                    <p className="text-[11px] text-adm-muted">{t("adm.al.levelLine", { level: t(`adm.al.lv.${a.level}`) })}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-adm-muted">{timeAgo(a.created_at, lang)}</span>
                </Link>
              ))}
            </Panel>
          </div>
        </>
      )}
      {!data && !loading && !error && <div className={`h-40 ${card}`} />}
    </>
  );
}
