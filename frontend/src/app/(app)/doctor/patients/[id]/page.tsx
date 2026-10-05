"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Plus } from "lucide-react";

import ClinicalBadge from "@/components/ClinicalBadge";
import NextVisitCard from "@/components/NextVisitCard";
import PredictionCard from "@/components/PredictionCard";
import { NumberField } from "@/components/doctor/ui";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { age as ageOf, clinicalStatusOf, initials, shortId } from "@/lib/clinical";
import { tierKey } from "@/lib/prediction";
import type {
  BloodGroup,
  ClinicalStatus,
  PatientClinical,
  PatientVitals,
  PredictionRow,
  ScanRow,
} from "@/lib/types";

interface PanelPatientInfo {
  id: string;
  full_name: string | null;
  email: string | null;
  dob: string | null;
  sex: string | null;
  phone: string | null;
  created_at?: string;
  next_visit_at?: string | null; // migration 0011
}

interface RecordsResponse {
  patient: PanelPatientInfo;
  predictions: PredictionRow[];
  scans: ScanRow[];
}

type Tab = "overview" | "clinical" | "lab" | "ai" | "retina" | "notes";
const TABS: Tab[] = ["overview", "clinical", "lab", "ai", "retina", "notes"];
const BLOOD_GROUPS: BloodGroup[] = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

function longDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const card = "flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6";
const cardTitle = "text-base font-bold text-slate-900";

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-[13px]">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value ?? "—"}</span>
    </div>
  );
}

/** Figma "Vital-n": slate tile, Plex Mono value tinted when out of range. */
function Vital({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string | null;
  unit: string;
  tone?: "warn" | "high";
}) {
  const border = tone === "high" ? "border-status-diabetes/20" : tone === "warn" ? "border-status-prediabetes/20" : "border-transparent";
  const color = tone === "high" ? "text-status-diabetes" : tone === "warn" ? "text-status-prediabetes" : "text-slate-900";
  return (
    <div className={`flex items-center justify-between rounded-lg border bg-slate-50 p-3 ${border}`}>
      <span className="text-[13px] font-medium text-slate-900">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className={`font-mono text-base font-bold ${color}`}>{value ?? "—"}</span>
        <span className="text-[11px] text-slate-500">{unit}</span>
      </span>
    </div>
  );
}

/** Timeline event: green dot + rail (Figma "Event-n"). */
function TimelineEvent({
  title,
  date,
  text,
  status,
  last,
  href,
}: {
  title: string;
  date: string;
  text: string;
  status?: ClinicalStatus;
  last?: boolean;
  href?: string;
}) {
  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-900">{title}</span>
        <span className="text-xs text-slate-500">{date}</span>
      </div>
      <p className="text-[13px] leading-[1.4] text-slate-500">{text}</p>
      {status && (
        <span className="pt-0.5">
          <ClinicalBadge status={status} withIcon />
        </span>
      )}
    </div>
  );
  return (
    <div className="flex gap-4">
      <div className="flex w-4 flex-col items-center">
        <span className="mt-1 size-3 shrink-0 rounded-full bg-brand" />
        {!last && <span className="mt-1 w-px flex-1 bg-slate-200" />}
      </div>
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 hover:opacity-80">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

/** Figma 02 Doctor Screens · patient-profile (2:1117). */
export default function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = use(params);
  const { tab: initialTab } = use(searchParams);
  const { t, lang } = useI18n();
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [clinical, setClinical] = useState<PatientClinical | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => (TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "overview"));

  const loadClinical = useCallback(() => {
    api<PatientClinical>(`/api/patients/${id}/clinical`)
      .then(setClinical)
      .catch(() => setClinical(null));
  }, [id]);

  useEffect(() => {
    api<RecordsResponse>(`/api/patients/${id}/records`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
    loadClinical();
  }, [id, t, loadClinical]);

  const latest = data?.predictions[0];
  const status = clinicalStatusOf(latest);
  const vitals = useMemo(() => {
    // latest non-null value of each measure; glucose / HbA1c / BMI fall back
    // to the last prediction's inputs
    const rows = clinical?.vitals ?? [];
    const pick = <K extends keyof PatientVitals>(k: K) => rows.find((r) => r[k] != null)?.[k] ?? null;
    const input = latest?.input;
    return {
      at: rows[0]?.measured_at ?? latest?.created_at ?? null,
      glucose: pick("fasting_glucose") ?? input?.blood_glucose_level ?? null,
      hba1c: pick("hba1c") ?? input?.HbA1c_level ?? null,
      systolic: pick("systolic"),
      diastolic: pick("diastolic"),
      weight: pick("weight_kg"),
      height: pick("height_cm"),
      bmiInput: input?.bmi ?? null,
    };
  }, [clinical, latest]);

  if (error) return <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />;

  const { patient, predictions, scans } = data;
  const age = ageOf(patient.dob);
  const bmi =
    vitals.weight && vitals.height
      ? Number((Number(vitals.weight) / (Number(vitals.height) / 100) ** 2).toFixed(1))
      : vitals.bmiInput;
  const eyeScans = scans.filter((s) => s.scan_type === "eye");

  const events = [
    ...predictions.map((p) => ({
      key: `p-${p.id}`,
      at: p.created_at,
      title: t("pp.ev.m1"),
      text: t("pp.ev.m1Text", { p: (p.probability * 100).toFixed(1), tier: t(`tier.${tierKey(p.risk_tier)}`) }),
      status: clinicalStatusOf(p),
      href: `/predictions/${p.id}`,
    })),
    ...scans.map((s) => ({
      key: `s-${s.id}`,
      at: s.created_at,
      title: t(`pp.ev.${s.scan_type}`),
      text: s.result?.label ?? "—",
      status: undefined,
      href: undefined,
    })),
    ...(clinical?.vitals ?? []).map((v) => ({
      key: `v-${v.id}`,
      at: v.measured_at,
      title: t("pp.ev.lab"),
      text: [
        v.hba1c != null ? `HbA1c ${v.hba1c} %` : null,
        v.fasting_glucose != null ? `${t("pp.v.glucose")} ${v.fasting_glucose} mg/dL` : null,
        v.systolic != null ? `${t("pp.v.bp")} ${v.systolic}/${v.diastolic ?? "—"} mmHg` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      status: undefined,
      href: undefined,
    })),
    // the record's creation sits in date order: lab results can be
    // entered with an earlier measurement date
    ...(patient.created_at
      ? [{ key: "admission", at: patient.created_at, title: t("pp.ev.admission"), text: t("pp.ev.admissionText"), status: undefined, href: undefined }]
      : []),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="flex flex-col gap-6">
      <Link href="/doctor/patients" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-brand">
        <ArrowLeft size={14} />
        {t("patients.title")}
      </Link>

      {/* Header-Sticky-Card */}
      <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-600">
              {initials(patient.full_name ?? patient.email)}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-extrabold text-slate-900">{patient.full_name ?? patient.email ?? "—"}</h1>
                <ClinicalBadge status={status} withIcon />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500">
                <span>
                  ID: <span className="font-mono">PT-{shortId(patient.id).toUpperCase()}</span>
                </span>
                <span className="h-3 w-px bg-slate-200" aria-hidden />
                <span>
                  {age != null ? t("common.ageShort", { n: age }) : "—"}
                  {patient.sex && ` • ${t(patient.sex === "male" ? "common.male" : "common.female")}`}
                </span>
                {patient.email && (
                  <>
                    <span className="h-3 w-px bg-slate-200" aria-hidden />
                    <span>{patient.email}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/doctor/retina"
              className="flex items-center gap-2 rounded-lg bg-brand-teal px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
            >
              <Eye size={14} />
              {t("pp.retina")}
            </Link>
            <Link
              href={`/doctor/diabetes?patient=${patient.id}`}
              className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
            >
              <Plus size={14} />
              {t("pp.newEval")}
            </Link>
          </div>
        </div>
        <div className="h-px bg-slate-200" />
        <div className="-mb-px flex gap-6 overflow-x-auto" role="tablist">
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`shrink-0 border-b-2 pb-2 text-sm transition-colors ${
                tab === k
                  ? "border-brand font-bold text-brand"
                  : "border-transparent font-medium text-slate-500 hover:text-slate-800"
              }`}
            >
              {t(`pp.tab.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex flex-col gap-5">
            <div className={card}>
              <p className={cardTitle}>{t("pp.ident")}</p>
              <div className="flex flex-col gap-3">
                <MetaRow label={t("pp.cnas")} value={clinical?.identifiers.cnas_number} />
                <MetaRow label={t("pp.chifa")} value={clinical?.identifiers.chifa_number} />
                <MetaRow label={t("common.dob")} value={patient.dob ? longDate(patient.dob, lang) : "—"} />
                <MetaRow label={t("pp.blood")} value={clinical?.identifiers.blood_group} />
                <MetaRow label={t("common.phone")} value={patient.phone} />
              </div>
            </div>
            <div className={card}>
              <p className={cardTitle}>{t("pp.timeline")}</p>
              {events.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                  {t("history.empty")}
                </p>
              )}
              <div className="flex flex-col">
                {events.map((e, i) => (
                  <TimelineEvent
                    key={e.key}
                    title={e.title}
                    date={longDate(e.at, lang)}
                    text={e.text}
                    status={e.status}
                    href={e.href}
                    last={i === events.length - 1}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className={card}>
              <div className="flex items-center justify-between gap-3">
                <p className={cardTitle}>{t("pp.vitals")}</p>
                {vitals.at && (
                  <p className="text-xs text-slate-500">{t("pp.measured", { d: new Date(vitals.at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "2-digit", month: "2-digit" }) })}</p>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <Vital
                  label={t("pp.v.glucose")}
                  value={vitals.glucose != null ? String(vitals.glucose) : null}
                  unit="mg/dL"
                  tone={vitals.glucose != null && Number(vitals.glucose) >= 126 ? "high" : vitals.glucose != null && Number(vitals.glucose) >= 100 ? "warn" : undefined}
                />
                <Vital
                  label={t("pp.v.hba1c")}
                  value={vitals.hba1c != null ? String(vitals.hba1c) : null}
                  unit="%"
                  tone={vitals.hba1c != null && Number(vitals.hba1c) >= 6.5 ? "high" : vitals.hba1c != null && Number(vitals.hba1c) >= 5.7 ? "warn" : undefined}
                />
                <Vital
                  label={t("pp.v.bp")}
                  value={vitals.systolic != null ? `${vitals.systolic}/${vitals.diastolic ?? "—"}` : null}
                  unit="mmHg"
                  tone={vitals.systolic != null && (Number(vitals.systolic) >= 140 || Number(vitals.diastolic ?? 0) >= 90) ? "warn" : undefined}
                />
                <Vital label={t("pp.v.weight")} value={vitals.weight != null ? String(vitals.weight) : null} unit="kg" />
                <Vital label={t("pp.v.height")} value={vitals.height != null ? String(vitals.height) : null} unit="cm" />
                <Vital
                  label={t("pp.v.bmi")}
                  value={bmi != null ? String(bmi) : null}
                  unit={bmi == null ? "" : bmi >= 30 ? t("pp.bmi.obese") : bmi >= 25 ? t("pp.bmi.over") : t("pp.bmi.normal")}
                  tone={bmi != null && bmi >= 30 ? "high" : bmi != null && bmi >= 25 ? "warn" : undefined}
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-[#a9c8be] p-5">
              <p className="text-sm font-bold text-slate-900">{t("pp.aiTitle")}</p>
              <p className="text-xs text-slate-600">{t("pp.aiDesc")}</p>
              <div className="flex flex-col gap-2">
                <Link href={`/doctor/diabetes?patient=${patient.id}`} className="rounded-md bg-brand p-3 text-center text-[13px] font-semibold text-white hover:opacity-90">
                  {t("pp.btnM1")}
                </Link>
                <Link href="/doctor/retina" className="rounded-md bg-brand-teal p-3 text-center text-[13px] font-semibold text-white hover:opacity-90">
                  {t("pp.btnM4")}
                </Link>
                <Link href="/doctor/type-classification" className="rounded-md bg-slate-900 p-3 text-center text-[13px] font-semibold text-white hover:opacity-90">
                  {t("pp.btnM2")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "clinical" && (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
          <IdentifiersForm
            patientId={patient.id}
            clinical={clinical}
            onSaved={loadClinical}
          />
          <div className="flex flex-col gap-5">
            <NextVisitCard patientId={patient.id} initial={patient.next_visit_at} />
            <LoginAccessCard patientId={patient.id} />
          </div>
        </div>
      )}

      {tab === "lab" && <LabTab patientId={patient.id} clinical={clinical} onSaved={loadClinical} />}

      {tab === "ai" &&
        (predictions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{t("history.empty")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {predictions.map((p) => (
              <PredictionCard key={p.id} prediction={p} />
            ))}
          </div>
        ))}

      {tab === "retina" &&
        (eyeScans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{t("pp.noRetina")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {eyeScans.map((s) => (
              <div key={s.id} className={card}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-bold text-slate-900">{s.result?.label ?? "—"}</p>
                  {s.result?.referable_dr != null && (
                    <span className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${s.result.referable_dr ? "bg-[#fee2e2] text-status-critical" : "bg-[#dcfce7] text-status-normal"}`}>
                      {s.result.referable_dr ? t("act.referable") : t("pp.notReferable")}
                    </span>
                  )}
                </div>
                {s.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                  <img src={s.image_url} alt="" className="max-h-56 rounded-lg border border-slate-100 object-contain" />
                )}
                <p className="text-xs text-slate-500">{longDate(s.created_at, lang)}</p>
              </div>
            ))}
          </div>
        ))}

      {tab === "notes" && <NotesTab patientId={patient.id} clinical={clinical} onSaved={loadClinical} />}
    </div>
  );
}

function MigrationNotice({ clinical }: { clinical: PatientClinical | null }) {
  const { t } = useI18n();
  if (!clinical || clinical.migrated) return null;
  return <p className="rounded-lg bg-[#fffbeb] px-4 py-3 text-[13px] font-semibold text-status-prediabetes">{t("pp.needs0012")}</p>;
}

function IdentifiersForm({
  patientId,
  clinical,
  onSaved,
}: {
  patientId: string;
  clinical: PatientClinical | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [cnas, setCnas] = useState(clinical?.identifiers.cnas_number ?? "");
  const [chifa, setChifa] = useState(clinical?.identifiers.chifa_number ?? "");
  const [blood, setBlood] = useState<string>(clinical?.identifiers.blood_group ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/patients/${patientId}/identifiers`, {
        method: "PUT",
        body: JSON.stringify({ cnas_number: cnas, chifa_number: chifa, blood_group: blood || null }),
      });
      setMsg({ ok: true, text: t("pp.saved") });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : t("common.error") });
    } finally {
      setBusy(false);
    }
  }

  const input =
    "h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15";
  return (
    <form onSubmit={save} className={card}>
      <p className={cardTitle}>{t("pp.ident")}</p>
      <MigrationNotice clinical={clinical} />
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-700">
        {t("pp.cnas")}
        <input className={`${input} font-mono`} value={cnas} maxLength={32} onChange={(e) => setCnas(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-700">
        {t("pp.chifa")}
        <input className={`${input} font-mono`} value={chifa} maxLength={32} onChange={(e) => setChifa(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-700">
        {t("pp.blood")}
        <select className={input} value={blood} onChange={(e) => setBlood(e.target.value)}>
          <option value="">—</option>
          {BLOOD_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-slate-500">{t("pp.privacyNote")}</p>
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-[13px] ${msg.ok ? "bg-[#dcfce7] text-status-normal" : "bg-red-50 text-red-600"}`}>{msg.text}</p>
      )}
      <button type="submit" disabled={busy} className="w-fit rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
        {busy ? t("auth.working") : t("common.save")}
      </button>
    </form>
  );
}

function LoginAccessCard({ patientId }: { patientId: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pwd, setPwd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function send(method: "login_link" | "temp_password") {
    setBusy(true);
    setMsg(null);
    setErr(null);
    setPwd(null);
    try {
      const res = await api<{ message: string; temp_password?: string }>(`/api/patients/${patientId}/credentials`, {
        method: "POST",
        body: JSON.stringify({ method }),
      });
      setMsg(res.message);
      if (res.temp_password) setPwd(res.temp_password);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card}>
      <div>
        <p className={cardTitle}>{t("patients.loginAccess")}</p>
        <p className="mt-1 text-[13px] text-slate-500">{t("patients.loginAccessDesc")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => send("login_link")}
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t("auth.working") : t("patients.sendLoginLink")}
        </button>
        <button
          type="button"
          onClick={() => send("temp_password")}
          disabled={busy}
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {t("patients.setTempPassword")}
        </button>
      </div>
      {msg && <p className="rounded-lg bg-[#e6f2eb] px-3 py-2 text-[13px] text-brand">{msg}</p>}
      {pwd && (
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-slate-100 px-4 py-3 text-center font-mono text-lg font-bold tracking-wider text-slate-800">{pwd}</code>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(pwd);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded-lg border border-slate-200 px-4 py-3 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            {copied ? t("common.copied") : t("common.copy")}
          </button>
        </div>
      )}
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{err}</p>}
    </div>
  );
}

function LabTab({
  patientId,
  clinical,
  onSaved,
}: {
  patientId: string;
  clinical: PatientClinical | null;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const empty = { systolic: "", diastolic: "", weight_kg: "", height_cm: "", fasting_glucose: "", hba1c: "", egfr: "", acr: "" };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fields: { k: keyof typeof empty; label: string }[] = [
    { k: "fasting_glucose", label: `${t("pp.v.glucose")} (mg/dL)` },
    { k: "hba1c", label: `${t("pp.v.hba1c")} (%)` },
    { k: "systolic", label: `${t("pp.v.sys")} (mmHg)` },
    { k: "diastolic", label: `${t("pp.v.dia")} (mmHg)` },
    { k: "weight_kg", label: `${t("pp.v.weight")} (kg)` },
    { k: "height_cm", label: `${t("pp.v.height")} (cm)` },
    { k: "egfr", label: "DFGe / eGFR (mL/min/1.73 m²)" },
    { k: "acr", label: "RAC / ACR (mg/g)" },
  ];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body: Record<string, number> = {};
    for (const { k } of fields) {
      const v = form[k].trim().replace(",", ".");
      if (v) body[k] = Number(v);
    }
    try {
      await api(`/api/patients/${patientId}/vitals`, { method: "POST", body: JSON.stringify(body) });
      setForm(empty);
      onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const rows = clinical?.vitals ?? [];
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <form onSubmit={save} className={card}>
        <p className={cardTitle}>{t("pp.addMeasure")}</p>
        <MigrationNotice clinical={clinical} />
        <div className="grid grid-cols-2 gap-3">
          {fields.map(({ k, label }) => (
            <NumberField key={k} label={label} value={form[k]} onChange={(v) => setForm((f) => ({ ...f, [k]: v }))} min={0} />
          ))}
        </div>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{err}</p>}
        <button type="submit" disabled={busy} className="w-fit rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? t("auth.working") : t("common.save")}
        </button>
      </form>
      <div className={card}>
        <p className={cardTitle}>{t("pp.labHistory")}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">{t("pp.noLab")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                  <th className="pb-3 pr-3">{t("pp.date")}</th>
                  <th className="pb-3 pr-3">{t("pp.v.glucose")}</th>
                  <th className="pb-3 pr-3">HbA1c</th>
                  <th className="pb-3 pr-3">{t("pp.v.bp")}</th>
                  <th className="pb-3 pr-3">{t("pp.v.weight")}</th>
                  <th className="pb-3 pr-3">DFGe</th>
                  <th className="pb-3">RAC</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-sans text-slate-500">{new Date(r.measured_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB")}</td>
                    <td className="py-2.5 pr-3">{r.fasting_glucose ?? "—"}</td>
                    <td className="py-2.5 pr-3">{r.hba1c ?? "—"}</td>
                    <td className="py-2.5 pr-3">{r.systolic != null ? `${r.systolic}/${r.diastolic ?? "—"}` : "—"}</td>
                    <td className="py-2.5 pr-3">{r.weight_kg ?? "—"}</td>
                    <td className="py-2.5 pr-3">{r.egfr ?? "—"}</td>
                    <td className="py-2.5">{r.acr ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function NotesTab({
  patientId,
  clinical,
  onSaved,
}: {
  patientId: string;
  clinical: PatientClinical | null;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/patients/${patientId}/notes`, { method: "POST", body: JSON.stringify({ body }) });
      setBody("");
      onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className={card}>
        <p className={cardTitle}>{t("pp.tab.notes")}</p>
        {(clinical?.notes ?? []).length === 0 && <p className="text-sm text-slate-500">{t("pp.noNotes")}</p>}
        {(clinical?.notes ?? []).map((n) => (
          <div key={n.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{n.doctor?.full_name ?? "—"}</span>
              <span>{new Date(n.created_at).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.5] text-slate-700">{n.body}</p>
          </div>
        ))}
      </div>
      <form onSubmit={save} className={card}>
        <p className={cardTitle}>{t("pp.addNote")}</p>
        <MigrationNotice clinical={clinical} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          maxLength={5000}
          placeholder={t("pp.notePlaceholder")}
          className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-900 outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
        />
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{err}</p>}
        <button type="submit" disabled={busy || !body.trim()} className="w-fit rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? t("auth.working") : t("common.save")}
        </button>
      </form>
    </div>
  );
}
