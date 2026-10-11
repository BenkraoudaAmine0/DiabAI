"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrainCircuit, CircleX, Footprints, Heart, Printer } from "lucide-react";

import { BADGE, Badge, IconTile, NumberField, PageTitle, Segmented, num } from "@/components/doctor/ui";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { ckdEpi2021, escCvRisk, kdigoRisk, type KdigoRisk } from "@/lib/clinicalTools";

const RISK_TONE: Record<KdigoRisk, string> = {
  low: "bg-[#dcfce7] text-status-normal",
  moderate: "bg-[#fef3c7] text-status-prediabetes",
  high: "bg-[#ffedd5] text-status-diabetes",
  veryHigh: "bg-[#fee2e2] text-status-critical",
};

function ModuleCard({
  icon,
  iconTone,
  title,
  sub,
  badge,
  badgeTone,
  desc,
  action,
  meta,
  metaTone = "text-slate-500",
  children,
}: {
  icon: typeof Heart;
  iconTone: string;
  title: string;
  sub: string;
  badge?: string;
  badgeTone: string;
  desc: string;
  action: React.ReactNode;
  meta: string;
  metaTone?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <IconTile icon={icon} tone={iconTone} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-base font-bold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{sub}</p>
          </div>
        </div>
        {badge && <Badge tone={badgeTone}>{badge}</Badge>}
      </div>
      <p className="text-sm leading-[1.5] text-slate-700">{desc}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {action}
        <p className={`text-xs ${metaTone}`}>{meta}</p>
      </div>
      {children}
    </div>
  );
}

const outlineBtn =
  "rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50";

function KidneyTool() {
  const { t } = useI18n();
  const [egfr, setEgfr] = useState("");
  const [creat, setCreat] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"male" | "female">("female");
  const [acr, setAcr] = useState("");

  const computed =
    num(creat) != null && num(age) != null ? ckdEpi2021(num(creat)!, num(age)!, sex) : undefined;
  const e = num(egfr) ?? computed;
  const a = num(acr);
  const res = e != null && a != null ? kdigoRisk(e, a) : null;

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label={t("m4.kidney.egfr")} value={egfr} onChange={setEgfr} min={0} />
        <NumberField label={t("m4.kidney.acr")} value={acr} onChange={setAcr} min={0} />
      </div>
      <p className="text-xs font-semibold text-slate-500">{t("m4.kidney.orCompute")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label={t("m4.kidney.creat")} value={creat} onChange={setCreat} min={0} />
        <NumberField label={t("m4.kidney.age")} value={age} onChange={setAge} min={0} />
        <Segmented
          label={t("m4.kidney.sex")}
          value={sex}
          onChange={setSex}
          options={[
            { value: "female", label: t("common.female") },
            { value: "male", label: t("common.male") },
          ]}
        />
      </div>
      {computed != null && num(egfr) == null && (
        <p className="font-mono text-xs text-slate-600">{t("m4.kidney.computed", { egfr: computed })}</p>
      )}
      {res && (
        <div role="status" className={`rounded-lg px-3 py-2.5 text-[13px] font-semibold ${RISK_TONE[res.risk]}`}>
          {t("m4.kidney.result", { g: res.g, a: res.a, risk: t(`m4.risk.${res.risk}`) })}
          <span className="mt-1 block font-normal">{t(`m4.kidney.advice.${res.risk}`)}</span>
        </div>
      )}
    </div>
  );
}

function CvTool() {
  const { t } = useI18n();
  const [type, setType] = useState<"t1" | "t2">("t2");
  const [age, setAge] = useState("");
  const [duration, setDuration] = useState("");
  const [flags, setFlags] = useState({
    establishedCvd: false,
    targetOrganDamage: false,
    hypertension: false,
    dyslipidaemia: false,
    smoking: false,
    obesity: false,
  });
  const labels: Record<keyof typeof flags, string> = {
    establishedCvd: t("m4.cv.cvd"),
    targetOrganDamage: t("m4.cv.tod"),
    hypertension: t("m4.cv.hta"),
    dyslipidaemia: t("m4.cv.lipids"),
    smoking: t("m4.cv.smoking"),
    obesity: t("m4.cv.obesity"),
  };
  const ready = num(age) != null && num(duration) != null;
  const res = ready ? escCvRisk({ diabetesType: type, age: num(age)!, durationYears: num(duration)!, ...flags }) : null;
  const tone = res
    ? res.risk === "veryHigh"
      ? RISK_TONE.veryHigh
      : res.risk === "high"
        ? RISK_TONE.high
        : RISK_TONE.moderate
    : "";

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Segmented
          label={t("m4.cv.type")}
          value={type}
          onChange={setType}
          options={[
            { value: "t1", label: "DT1 / T1" },
            { value: "t2", label: "DT2 / T2" },
          ]}
        />
        <NumberField label={t("m4.cv.age")} value={age} onChange={setAge} min={0} />
        <NumberField label={t("m4.cv.duration")} value={duration} onChange={setDuration} min={0} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(flags) as (keyof typeof flags)[]).map((k) => (
          <label key={k} className="flex items-start gap-2 text-[13px] text-slate-700">
            <input
              type="checkbox"
              checked={flags[k]}
              onChange={(e) => setFlags((f) => ({ ...f, [k]: e.target.checked }))}
              className="mt-0.5 size-4 accent-[#0e7c4a]"
            />
            {labels[k]}
          </label>
        ))}
      </div>
      {res && (
        <div role="status" className={`rounded-lg px-3 py-2.5 text-[13px] font-semibold ${tone}`}>
          {t("m4.cv.result", { risk: t(`m4.cv.risk.${res.risk}`) })}
          <ul className="mt-1 list-disc pl-5 font-normal">
            {res.reasons.map((r) => (
              <li key={r}>{t(r)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-slate-400">{t("m4.cv.source")}</p>
    </div>
  );
}

function NeuropathyResources() {
  const { t } = useI18n();
  const block = (title: string, keys: string[]) => (
    <div>
      <p className="text-[13px] font-bold text-slate-900">{t(title)}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-[1.5] text-slate-600">
        {keys.map((k) => (
          <li key={k}>{t(k)}</li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 print:border-0">
      {block("m4.neuro.mono.title", ["m4.neuro.mono.1", "m4.neuro.mono.2", "m4.neuro.mono.3", "m4.neuro.mono.4"])}
      {block("m4.neuro.fork.title", ["m4.neuro.fork.1"])}
      {block("m4.neuro.iwgdf.title", ["m4.neuro.iwgdf.0", "m4.neuro.iwgdf.1", "m4.neuro.iwgdf.2", "m4.neuro.iwgdf.3"])}
      {block("m4.neuro.edu.title", ["m4.neuro.edu.1", "m4.neuro.edu.2", "m4.neuro.edu.3", "m4.neuro.edu.4"])}
      <button type="button" onClick={() => window.print()} className={`flex w-fit items-center gap-2 ${outlineBtn} print:hidden`}>
        <Printer size={14} />
        {t("m4.neuro.print")}
      </button>
    </div>
  );
}

/** Figma 02 Doctor Screens · complications-hub (Module M4, "Page new" 2:2406). */
export default function ComplicationsHubPage() {
  const { t } = useI18n();
  const [open, setOpen] = useState<"kidney" | "cv" | "neuro" | null>(null);
  const toggle = (k: typeof open) => setOpen((o) => (o === k ? null : k));
  // whether the foot model is installed on the API server (no validation claim)
  const [footModel, setFootModel] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ models: Record<string, boolean> }>("/api/health")
      .then((r) => setFootModel(Boolean(r.models?.foot)))
      .catch(() => setFootModel(null));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("m4.title")} subtitle={t("m4.subtitle")} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <ModuleCard
          icon={Footprints}
          iconTone="bg-[#e6f2eb] text-brand"
          title={t("m4.foot.title")}
          sub={t("m4.foot.sub")}
          badge={footModel === null ? undefined : t(footModel ? "m4.modelInstalled" : "m4.modelMissing")}
          badgeTone={footModel ? BADGE.green : BADGE.slate}
          desc={t("m4.foot.desc")}
          action={
            <Link href="/doctor/scans" className="rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90">
              {t("m4.foot.start")}
            </Link>
          }
          meta={t("m4.foot.format")}
        />
        <ModuleCard
          icon={CircleX}
          iconTone="bg-[#fef3c7] text-status-prediabetes"
          title={t("m4.kidney.title")}
          sub={t("m4.kidney.sub")}
          badge={t("m4.researchBadge")}
          badgeTone={BADGE.amber}
          desc={t("m4.kidney.desc")}
          action={
            <button type="button" onClick={() => toggle("kidney")} aria-expanded={open === "kidney"} className={outlineBtn}>
              {open === "kidney" ? t("dr.close") : t("m4.kidney.start")}
            </button>
          }
          meta={t("m4.experimental")}
          metaTone="font-semibold text-status-prediabetes"
        >
          {open === "kidney" && <KidneyTool />}
        </ModuleCard>
        <ModuleCard
          icon={Heart}
          iconTone="bg-[#fef3c7] text-status-prediabetes"
          title={t("m4.cv.title")}
          sub={t("m4.cv.sub")}
          badge={t("m4.researchBadge")}
          badgeTone={BADGE.amber}
          desc={t("m4.cv.desc")}
          action={
            <button type="button" onClick={() => toggle("cv")} aria-expanded={open === "cv"} className={outlineBtn}>
              {open === "cv" ? t("dr.close") : t("m4.cv.start")}
            </button>
          }
          meta={t("m4.experimental")}
          metaTone="font-semibold text-status-prediabetes"
        >
          {open === "cv" && <CvTool />}
        </ModuleCard>
        <ModuleCard
          icon={BrainCircuit}
          iconTone="bg-slate-100 text-slate-500"
          title={t("m4.neuro.title")}
          sub={t("m4.neuro.sub")}
          badge={t("m4.educationBadge")}
          badgeTone={BADGE.slate}
          desc={t("m4.neuro.desc")}
          action={
            <button type="button" onClick={() => toggle("neuro")} aria-expanded={open === "neuro"} className={outlineBtn}>
              {open === "neuro" ? t("dr.close") : t("m4.neuro.start")}
            </button>
          }
          meta={t("m4.neuro.meta")}
        >
          {open === "neuro" && <NeuropathyResources />}
        </ModuleCard>
      </div>
    </div>
  );
}
