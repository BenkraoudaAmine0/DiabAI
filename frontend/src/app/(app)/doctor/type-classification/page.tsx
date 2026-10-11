"use client";

import { useState } from "react";
import { CircleX, Dna, Play } from "lucide-react";

import {
  BADGE,
  Badge,
  Card,
  IconTile,
  MoreLink,
  NumberField,
  PageTitle,
  Segmented,
  num,
  useTriOptions,
} from "@/components/doctor/ui";
import { useI18n } from "@/i18n";
import {
  classifyDiabetesType,
  gestationalDiabetes,
  inOgttWindow,
  type Tri,
  type TypeInputs,
} from "@/lib/clinicalTools";

function TypeCard({
  icon = CircleX,
  prefix,
}: {
  icon?: typeof CircleX;
  prefix: "t1" | "t2" | "other";
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex items-center gap-4">
        <IconTile icon={icon} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-lg font-bold text-slate-900">{t(`m2.${prefix}.title`)}</p>
          <p className="text-xs text-slate-500">{t(`m2.${prefix}.sub`)}</p>
        </div>
      </div>
      <p className="text-sm leading-[1.5] text-slate-700">{t(`m2.${prefix}.desc`)}</p>
      {open && <p className="rounded-lg bg-slate-50 p-3 text-[13px] leading-[1.5] text-slate-600">{t(`m2.${prefix}.more`)}</p>}
      <MoreLink open={open} onClick={() => setOpen((o) => !o)} />
    </Card>
  );
}

/** Highlighted gestational card with the IADPSG OGTT check. */
function GestationalCard() {
  const { t } = useI18n();
  const [weeks, setWeeks] = useState("24");
  const [fasting, setFasting] = useState("");
  const [oneHour, setOneHour] = useState("");
  const [twoHour, setTwoHour] = useState("");
  const [open, setOpen] = useState(false);

  const values = { fasting: num(fasting), oneHour: num(oneHour), twoHour: num(twoHour) };
  const any = Object.values(values).some((v) => v != null);
  const res = gestationalDiabetes(values);
  const inWindow = inOgttWindow(num(weeks));
  const labels = { fasting: t("m2.gdm.fasting"), oneHour: t("m2.gdm.oneHour"), twoHour: t("m2.gdm.twoHour") };

  return (
    <div className="flex flex-col gap-5 rounded-xl border-2 border-brand-teal bg-[#ecfdf5] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <IconTile icon={CircleX} tone="border border-brand-teal bg-white text-brand-teal" />
          <div className="flex flex-col gap-0.5">
            <p className="text-lg font-bold text-slate-900">{t("m2.gdm.title")}</p>
            <p className="text-xs text-brand-teal">{t("m2.gdm.sub")}</p>
          </div>
        </div>
        <Badge tone={BADGE.teal}>{t("m2.gdm.badge")}</Badge>
      </div>
      <p className="text-sm leading-[1.5] text-slate-700">{t("m2.gdm.desc")}</p>

      <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="ga" className="text-[13px] font-semibold text-slate-700">
            {t("m2.gdm.age")}
          </label>
          <span className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
            <input
              id="ga"
              type="number"
              min={0}
              max={42}
              value={weeks}
              onChange={(e) => setWeeks(e.target.value)}
              className="w-10 bg-transparent text-[13px] font-bold text-slate-900 outline-none"
            />
            <span className="text-[13px] font-bold text-slate-900">{t("m2.gdm.weeks")}</span>
          </span>
        </div>
        <p className="text-xs text-slate-500">{t("m2.gdm.notice")}</p>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label={labels.fasting} value={fasting} onChange={setFasting} min={0} />
          <NumberField label={labels.oneHour} value={oneHour} onChange={setOneHour} min={0} />
          <NumberField label={labels.twoHour} value={twoHour} onChange={setTwoHour} min={0} />
        </div>
        {any ? (
          <p
            role="status"
            className={`rounded-md px-3 py-2 text-[13px] font-semibold ${
              res.positive ? "bg-[#fee2e2] text-status-critical" : "bg-[#dcfce7] text-status-normal"
            }`}
          >
            {res.positive
              ? t("m2.gdm.positive", { list: res.abnormal.map((k) => labels[k]).join(", ") })
              : t("m2.gdm.negative")}
          </p>
        ) : (
          <p className="text-xs text-slate-400">{t("m2.gdm.incomplete")}</p>
        )}
        {inWindow === false && <p className="text-xs font-semibold text-status-prediabetes">{t("m2.gdm.outWindow")}</p>}
      </div>
      {open && <p className="rounded-lg bg-white/70 p-3 text-[13px] leading-[1.5] text-slate-600">{t("m2.gdm.more")}</p>}
      <MoreLink open={open} onClick={() => setOpen((o) => !o)} tone="text-brand-teal" />
    </div>
  );
}

const EMPTY: TypeInputs = {
  ketoacidosis: "unknown",
  insulinWithin6Months: "unknown",
  autoantibodies: "unknown",
  cPeptide: "unknown",
  familyMultigeneration: "unknown",
  duringPregnancy: "no",
  secondaryCause: "no",
  metabolicFeatures: "unknown",
};

function ResearchClassifier() {
  const { t } = useI18n();
  const tri = useTriOptions();
  const [age, setAge] = useState("");
  const [bmi, setBmi] = useState("");
  const [x, setX] = useState<TypeInputs>(EMPTY);
  const [result, setResult] = useState<ReturnType<typeof classifyDiabetesType> | null>(null);

  const set = <K extends keyof TypeInputs>(k: K) => (v: TypeInputs[K]) => {
    setX((s) => ({ ...s, [k]: v }));
    setResult(null);
  };

  return (
    <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <NumberField label={t("m2.f.age")} value={age} onChange={(v) => { setAge(v); setResult(null); }} min={0} />
        <NumberField label={t("m2.f.bmi")} value={bmi} onChange={(v) => { setBmi(v); setResult(null); }} min={0} />
        <Segmented
          label={t("m2.f.antibodies")}
          value={x.autoantibodies}
          onChange={set("autoantibodies")}
          options={[
            { value: "positive", label: t("m2.f.positive") },
            { value: "negative", label: t("m2.f.negative") },
            { value: "unknown", label: t("dr.unknown") },
          ]}
        />
        <Segmented
          label={t("m2.f.cpeptide")}
          value={x.cPeptide}
          onChange={set("cPeptide")}
          options={[
            { value: "low", label: t("m2.f.low") },
            { value: "normal", label: t("m2.f.normal") },
            { value: "unknown", label: t("dr.unknown") },
          ]}
        />
        <Segmented<Tri> label={t("m2.f.dka")} value={x.ketoacidosis} onChange={set("ketoacidosis")} options={tri} />
        <Segmented<Tri> label={t("m2.f.insulin")} value={x.insulinWithin6Months} onChange={set("insulinWithin6Months")} options={tri} />
        <Segmented<Tri> label={t("m2.f.family")} value={x.familyMultigeneration} onChange={set("familyMultigeneration")} options={tri} />
        <Segmented<Tri> label={t("m2.f.metabolic")} value={x.metabolicFeatures} onChange={set("metabolicFeatures")} options={tri} />
        <Segmented<Tri> label={t("m2.f.pregnancy")} value={x.duringPregnancy} onChange={set("duringPregnancy")} options={tri} />
        <Segmented<Tri> label={t("m2.f.secondary")} value={x.secondaryCause} onChange={set("secondaryCause")} options={tri} />
      </div>
      <button
        type="button"
        onClick={() => setResult(classifyDiabetesType({ ...x, ageAtDiagnosis: num(age), bmi: num(bmi) }))}
        className="w-fit rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
      >
        {t("dr.compute")}
      </button>

      {result && (
        <div role="status" className="flex flex-col gap-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("m2.res.title")}</p>
            <Badge tone={BADGE.amber}>{t("m2.res.confidence", { c: t(`m2.conf.${result.confidence}`) })}</Badge>
          </div>
          <p className="text-xl font-extrabold text-slate-900">{t(`m2.type.${result.type}`)}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[13px] font-semibold text-slate-700">{t("m2.res.reasons")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-slate-600">
                {result.reasons.map((r) => (
                  <li key={r}>{t(r)}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-700">{t("m2.res.next")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-slate-600">
                {result.nextSteps.map((r) => (
                  <li key={r}>{t(r)}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs font-semibold text-status-prediabetes">{t("m2.res.disclaimer")}</p>
        </div>
      )}
    </div>
  );
}

/** Figma 02 Doctor Screens · type-classification (Module M2). */
export default function TypeClassificationPage() {
  const { t } = useI18n();
  const [research, setResearch] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("m2.title")} subtitle={t("m2.subtitle")} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <TypeCard prefix="t1" />
        <TypeCard prefix="t2" />
        <GestationalCard />
        <TypeCard prefix="other" icon={Dna} />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-base font-bold text-slate-900">{t("dr.research")}</p>
          <Badge tone={BADGE.amber}>{t("dr.experimental")}</Badge>
        </div>
        <p className="text-[13px] leading-[1.5] text-slate-700">{t("m2.research.desc")}</p>
        {!research ? (
          <button
            type="button"
            onClick={() => setResearch(true)}
            className="flex w-fit items-center gap-2 rounded-lg border border-brand bg-white px-5 py-2.5 text-[13px] font-semibold text-brand hover:bg-brand/5"
          >
            <Play size={14} />
            {t("m2.research.launch")}
          </button>
        ) : (
          <ResearchClassifier />
        )}
      </div>
    </div>
  );
}
