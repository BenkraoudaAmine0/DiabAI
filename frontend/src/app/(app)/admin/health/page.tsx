"use client";

import { BrainCircuit, CircleCheck, Database, Server, Sparkles, Timer, type LucideIcon } from "lucide-react";

import { ALERT_STATUS_TONE, SERVICE_TONE } from "@/components/admin/labels";
import { PageHeading, Panel, StateBox, StatusPill, TONES, card, useAdminApi } from "@/components/admin/ui";
import { useI18n } from "@/i18n";
import { type HealthResponse, type ServiceStatus, duration, shortDate, timeAgo } from "@/lib/admin";

function ServiceCard({
  icon: IconCmp,
  name,
  status,
  value,
  valueLabel,
  left,
  right,
}: {
  icon: LucideIcon;
  name: string;
  status: ServiceStatus;
  value: string;
  valueLabel: string;
  left: [string, string];
  right: [string, string];
}) {
  const { t } = useI18n();
  const tone = SERVICE_TONE[status];
  return (
    <div className={`flex min-w-0 flex-col gap-4 p-[18px] ${card}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex size-9 items-center justify-center rounded-[10px] ${TONES[tone].pill}`}>
            <IconCmp size={18} />
          </span>
          <p className="text-[15px] font-bold text-adm-ink">{name}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${TONES[tone].pill.split(" ")[1]}`}>
          <span className={`size-2 rounded-full ${TONES[tone].dot}`} aria-hidden />
          {t(`adm.svcSt.${status}`)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[28px] font-bold tracking-[-0.56px] text-adm-ink">{value}</p>
        <p className="text-[11px] text-adm-muted">{valueLabel}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        {[left, right].map(([label, v]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-adm-muted">{label}</span>
            <span className="truncate font-semibold text-adm-ink">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Figma 05 Admin Screens · System health (109:31346): live checks run by
 *  the API on each load; traffic is counted in memory since its last start. */
export default function AdminHealthPage() {
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useAdminApi<HealthResponse>("/api/admin/health");
  const ms = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)} ms`);

  const minutes = data?.traffic?.minutes ?? [];
  const peak = Math.max(1, ...minutes.map((m) => m.requests));
  const s = data?.services;

  return (
    <>
      <PageHeading title={t("adm.health.title")} subtitle={t("adm.health.subtitle")} onRefresh={reload} />
      {error && <StateBox kind="error" message={error} onRetry={reload} />}
      {loading && <StateBox kind="loading" />}

      {data && s && (
        <>
          <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2 xl:grid-cols-4">
            <ServiceCard
              icon={Server}
              name={t("adm.svc.api")}
              status={s.api.status}
              value={duration(s.api.uptime_seconds, lang)}
              valueLabel={t("adm.health.uptime")}
              left={[t("adm.health.incidents"), t("adm.health.incidentsN", { n: s.api.incidents_30d })]}
              right={[t("adm.health.latency"), `${ms(s.api.p95_ms)} p95`]}
            />
            <ServiceCard
              icon={Database}
              name={t("adm.svc.database")}
              status={s.database.status}
              value={ms(s.database.latency_ms)}
              valueLabel={t("adm.health.query")}
              left={[t("adm.health.incidents"), t("adm.health.incidentsN", { n: s.database.incidents_30d })]}
              right={[t("adm.health.storage"), s.database.storage_ok ? ms(s.database.storage_latency_ms) : t("adm.svcSt.down")]}
            />
            <ServiceCard
              icon={BrainCircuit}
              name={t("adm.svc.ml")}
              status={s.ml.status}
              value={`${s.ml.loaded}/${s.ml.total}`}
              valueLabel={t("adm.health.modelsLoaded")}
              left={[t("adm.health.incidents"), t("adm.health.incidentsN", { n: s.ml.incidents_30d })]}
              right={[t("adm.health.latency"), `${ms(s.ml.p95_ms)} p95`]}
            />
            <ServiceCard
              icon={Sparkles}
              name={t("adm.svc.ai")}
              status={s.ai.status}
              value={String(s.ai.calls_24h)}
              valueLabel={t("adm.health.calls24h")}
              left={[t("adm.health.model"), s.ai.model]}
              right={[t("adm.health.cost24h"), `$${s.ai.cost_24h_usd.toFixed(4)}`]}
            />
          </div>
          {s.database.error && <StateBox kind="error" message={s.database.error} />}

          <div className="grid grid-cols-1 items-start gap-[14px] xl:grid-cols-2">
            <Panel title={t("adm.health.traffic")} aside={t("adm.health.lastHour")}>
              <div className="flex items-center gap-4 text-[11px] text-adm-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-adm-teal" aria-hidden />
                  {t("adm.health.reqMin")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-adm-amber" aria-hidden />
                  {t("adm.health.mlShare")}
                </span>
              </div>
              <div className="flex h-[165px] items-end gap-[3px] rounded-[10px] bg-adm-soft p-2" role="img" aria-label={t("adm.health.traffic")}>
                {minutes.map((m) => {
                  const h = (m.requests / peak) * 100;
                  const ml = m.requests ? (m.ml_requests / m.requests) * h : 0;
                  return (
                    <div
                      key={m.minute}
                      className="flex flex-1 flex-col justify-end"
                      style={{ height: "100%" }}
                      title={`${new Date(m.minute * 1000).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" })} · ${m.requests} req${m.p95_ms != null ? ` · p95 ${Math.round(m.p95_ms)} ms` : ""}`}
                    >
                      <div className="rounded-t-sm bg-adm-amber" style={{ height: `${ml}%` }} />
                      <div className="bg-adm-teal" style={{ height: `${h - ml}%`, minHeight: m.requests ? 2 : 0 }} />
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  [String(data.traffic?.requests_per_minute ?? 0), t("adm.health.reqMin")],
                  [ms(data.traffic?.api_p95_ms), t("adm.health.apiP95")],
                  [ms(data.traffic?.ml_p95_ms), t("adm.health.mlP95")],
                ].map(([v, label]) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <p className="text-lg font-bold text-adm-ink">{v}</p>
                    <p className="text-[11px] text-adm-muted">{label}</p>
                  </div>
                ))}
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-adm-muted">
                <Timer size={12} />
                {t("adm.health.memoryNote")}
              </p>
            </Panel>

            <Panel title={t("adm.health.incidentsTitle")} aside={t("adm.period.30d")}>
              {data.incidents.length === 0 && (
                <div className="flex items-center gap-3 rounded-[10px] bg-adm-green-bg p-3 text-xs font-semibold text-adm-green">
                  <CircleCheck size={18} />
                  {t("adm.health.noIncidents")}
                </div>
              )}
              {data.incidents.map((i) => (
                <div key={i.id} className="flex items-center gap-3 border-b border-adm-border py-2.5 last:border-b-0">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-[10px] ${TONES[ALERT_STATUS_TONE[i.status]].pill}`}>
                    <Timer size={15} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-[13px] font-semibold text-adm-ink">{i.message}</p>
                    <p className="text-[11px] text-adm-muted">
                      {t(`adm.svc.${i.service ?? "api"}`)} · {i.status === "resolved" ? shortDate(i.created_at, lang) : timeAgo(i.created_at, lang)}
                    </p>
                  </div>
                  <StatusPill tone={ALERT_STATUS_TONE[i.status]}>{t(`adm.al.st.${i.status}`)}</StatusPill>
                </div>
              ))}
            </Panel>
          </div>
          <p className="text-[11px] text-adm-muted">{t("adm.ov.checked", { time: timeAgo(data.checked_at, lang) })} · {t("adm.health.embeddings")}: {s.ai.embeddings}</p>
        </>
      )}
    </>
  );
}
