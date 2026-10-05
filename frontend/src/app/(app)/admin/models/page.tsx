"use client";

import { useMemo, useState } from "react";
import { Boxes, HardDrive, PackagePlus, Rocket, ScanSearch } from "lucide-react";

import { MODEL_TONE } from "@/components/admin/labels";
import {
  Btn,
  DataTable,
  FilterSelect,
  Modal,
  Notice,
  PageHeading,
  Pagination,
  Panel,
  SearchInput,
  StateBox,
  StatusPill,
  SummaryCard,
  cellCls,
  fieldCls,
  labelCls,
  rowCls,
  useAdminApi,
  usePaged,
} from "@/components/admin/ui";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import {
  MODEL_STATUSES,
  MODEL_TASKS,
  type DetectedModel,
  type ModelStatus,
  type ModelTask,
  type ModelsResponse,
  bytes,
  shortDate,
} from "@/lib/admin";

/** "AUC=0.93, Recall=91%" ⇄ {AUC: 0.93, Recall: "91%"} */
function parseMetrics(text: string): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const part of text.split(/[,\n;]/)) {
    const [k, ...rest] = part.split("=");
    const key = k?.trim();
    const raw = rest.join("=").trim();
    if (!key || !raw) continue;
    const num = Number(raw.replace(",", "."));
    out[key.slice(0, 40)] = Number.isFinite(num) && /^[\d.,-]+$/.test(raw) ? num : raw.slice(0, 40);
  }
  return out;
}

function metricsText(m: Record<string, number | string>): string {
  return Object.entries(m)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
}

function RegisterDialog({ detected, onClose, onDone }: { detected: DetectedModel[]; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [task, setTask] = useState<ModelTask>("diabetes_risk");
  const [status, setStatus] = useState<ModelStatus>("candidate");
  const [artifact, setArtifact] = useState("");
  const [metrics, setMetrics] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/models", {
        method: "POST",
        body: JSON.stringify({ name, version, task, status, artifact: artifact || null, metrics: parseMetrics(metrics), notes: notes || null }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("adm.mod.registerTitle")} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <label className={`${labelCls} col-span-2 sm:col-span-1`}>
          {t("adm.mod.colName")}
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} />
        </label>
        <label className={`${labelCls} col-span-2 sm:col-span-1`}>
          {t("adm.mod.colVersion")}
          <input required maxLength={40} value={version} placeholder="1.0.0" onChange={(e) => setVersion(e.target.value)} className={fieldCls} />
        </label>
        <label className={`${labelCls} col-span-2 sm:col-span-1`}>
          {t("adm.mod.task")}
          <select value={task} onChange={(e) => setTask(e.target.value as ModelTask)} className={fieldCls}>
            {MODEL_TASKS.map((v) => (
              <option key={v} value={v}>
                {t(`adm.mod.task.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelCls} col-span-2 sm:col-span-1`}>
          {t("adm.users.colStatus")}
          <select value={status} onChange={(e) => setStatus(e.target.value as ModelStatus)} className={fieldCls}>
            {MODEL_STATUSES.map((v) => (
              <option key={v} value={v}>
                {t(`adm.mod.st.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelCls} col-span-2`}>
          {t("adm.mod.artifact")}
          <select value={artifact} onChange={(e) => setArtifact(e.target.value)} className={fieldCls}>
            <option value="">{t("adm.mod.noArtifact")}</option>
            {detected
              .filter((d) => d.sha256 && d.artifact)
              .map((d) => (
                <option key={d.key} value={d.artifact}>
                  {d.artifact} ({t(`adm.mod.task.${d.task}`)})
                </option>
              ))}
          </select>
        </label>
        <label className={`${labelCls} col-span-2`}>
          {t("adm.mod.metrics")}
          <input value={metrics} placeholder="AUC=0.97, Recall=0.91" onChange={(e) => setMetrics(e.target.value)} className={fieldCls} />
        </label>
        <label className={`${labelCls} col-span-2`}>
          {t("adm.mod.notes")}
          <textarea value={notes} maxLength={2000} rows={2} onChange={(e) => setNotes(e.target.value)} className={`${fieldCls} h-auto py-2`} />
        </label>
        {error && (
          <div className="col-span-2">
            <Notice ok={false}>{error}</Notice>
          </div>
        )}
        <div className="col-span-2 flex justify-end gap-2">
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn type="submit" variant="primary" icon={PackagePlus} disabled={busy}>
            {busy ? t("auth.working") : t("adm.mod.register")}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

/** Figma 05 Admin Screens · Model registry (109:31126). */
export default function AdminModelsPage() {
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useAdminApi<ModelsResponse>("/api/admin/models");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ModelStatus>("all");
  const [task, setTask] = useState<"all" | ModelTask>("all");
  const [registering, setRegistering] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.registry ?? []).filter(
      (m) =>
        (status === "all" || m.status === status) &&
        (task === "all" || m.task === task) &&
        (!needle || `${m.name} ${m.version}`.toLowerCase().includes(needle))
    );
  }, [data, q, status, task]);
  const { slice, page, pages, setPage, total } = usePaged(rows, `${q}|${status}|${task}`);

  async function changeStatus(id: string, next: ModelStatus) {
    setMsg(null);
    try {
      await api(`/api/admin/models/${id}`, { method: "PUT", body: JSON.stringify({ status: next }) });
      setMsg({ ok: true, text: t("adm.mod.updated") });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    }
  }

  const s = data?.summary;
  return (
    <>
      <PageHeading title={t("adm.mod.title")} subtitle={t("adm.mod.subtitle")} onRefresh={reload} />
      {s && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard icon={Boxes} value={s.registered} label={t("adm.mod.registered")} />
          <SummaryCard icon={Rocket} value={s.production} label={t("adm.mod.inProduction")} tone="green" />
          <SummaryCard icon={ScanSearch} value={s.needs_review} label={t("adm.mod.needReview")} tone="amber" />
          <SummaryCard icon={HardDrive} value={`${s.loaded}/${s.expected}`} label={t("adm.mod.onServer")} tone="blue" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder={t("adm.mod.search")} />
        <FilterSelect
          label={t("adm.users.colStatus")}
          value={status}
          onChange={setStatus}
          options={[{ value: "all", label: t("adm.pat.allStatuses") }, ...MODEL_STATUSES.map((v) => ({ value: v, label: t(`adm.mod.st.${v}`) }))]}
        />
        <FilterSelect
          label={t("adm.mod.task")}
          value={task}
          onChange={setTask}
          options={[{ value: "all", label: t("adm.mod.allTasks") }, ...MODEL_TASKS.map((v) => ({ value: v, label: t(`adm.mod.task.${v}`) }))]}
        />
        <div className="flex-1" />
        <Btn icon={PackagePlus} variant="primary" onClick={() => setRegistering(true)} disabled={!data?.registry_available}>
          {t("adm.mod.register")}
        </Btn>
      </div>

      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
      {data && !data.registry_available && <Notice ok={false}>{t("adm.migration0013")}</Notice>}
      {error && <StateBox kind="error" message={error} onRetry={reload} />}
      {loading && <StateBox kind="loading" />}

      {data && (
        <>
          <DataTable
            head={[t("adm.mod.colName"), t("adm.mod.colVersion"), t("adm.mod.task"), t("adm.mod.colDate"), t("adm.users.colStatus"), t("adm.mod.colMetrics")]}
            footer={<Pagination page={page} pages={pages} total={total} setPage={setPage} />}
          >
            {slice.map((m) => (
              <tr key={m.id} className={rowCls}>
                <td className={`${cellCls} font-semibold text-adm-ink`} title={m.notes ?? undefined}>
                  {m.name}
                </td>
                <td className={`${cellCls} font-mono text-adm-muted`}>v{m.version}</td>
                <td className={`${cellCls} text-adm-muted`}>{t(`adm.mod.task.${m.task}`)}</td>
                <td className={`${cellCls} text-adm-muted`}>{shortDate(m.updated_at ?? m.created_at, lang)}</td>
                <td className={cellCls}>
                  <label className="inline-flex items-center gap-1">
                    <StatusPill tone={MODEL_TONE[m.status]}>{t(`adm.mod.st.${m.status}`)}</StatusPill>
                    <select
                      value={m.status}
                      onChange={(e) => changeStatus(m.id, e.target.value as ModelStatus)}
                      aria-label={t("adm.mod.changeStatus")}
                      title={t("adm.mod.changeStatus")}
                      className="w-5 cursor-pointer bg-transparent text-adm-muted outline-none"
                    >
                      {MODEL_STATUSES.map((v) => (
                        <option key={v} value={v}>
                          {t(`adm.mod.st.${v}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </td>
                <td className={`${cellCls} text-adm-muted`}>{metricsText(m.metrics) || "—"}</td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={6} className="p-3">
                  <StateBox kind="empty" message={data.registry.length ? undefined : t("adm.mod.emptyRegistry")} />
                </td>
              </tr>
            )}
          </DataTable>

          <Panel title={t("adm.mod.detected")} aside={t("adm.mod.detectedHint")}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.44px] text-adm-muted">
                    <th className="py-2 pr-3 font-semibold">{t("adm.mod.task")}</th>
                    <th className="py-2 pr-3 font-semibold">{t("adm.mod.artifact")}</th>
                    <th className="py-2 pr-3 font-semibold">{t("adm.mod.size")}</th>
                    <th className="py-2 pr-3 font-semibold">SHA-256</th>
                    <th className="py-2 font-semibold">{t("adm.mod.registry")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detected.map((d) => (
                    <tr key={d.key} className="border-t border-adm-border">
                      <td className="py-2 pr-3 font-semibold text-adm-ink">{t(`adm.mod.task.${d.task}`)}</td>
                      <td className="max-w-[220px] truncate py-2 pr-3 font-mono text-adm-muted">
                        {d.loaded ? d.artifact : <span className="font-sans text-adm-amber">{t("adm.mod.notInstalled")}</span>}
                      </td>
                      <td className="py-2 pr-3 text-adm-muted">{bytes(d.size_bytes)}</td>
                      <td className="py-2 pr-3 font-mono text-adm-muted">{d.sha256 ? `${d.sha256.slice(0, 12)}…` : "—"}</td>
                      <td className="py-2">
                        {d.registered_as ? (
                          <StatusPill tone={MODEL_TONE[d.registered_as.status]}>
                            {d.registered_as.name} v{d.registered_as.version}
                          </StatusPill>
                        ) : (
                          <span className="text-adm-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {registering && data && (
        <RegisterDialog
          detected={data.detected}
          onClose={() => setRegistering(false)}
          onDone={() => {
            setRegistering(false);
            setMsg({ ok: true, text: t("adm.mod.registeredMsg") });
            reload();
          }}
        />
      )}
    </>
  );
}
