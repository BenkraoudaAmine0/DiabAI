/** Rule-based clinical calculators behind the Figma research modules
 *  (M2 type classification, M4 complications). Each follows a published,
 *  widely used reference; all are decision support only and are labelled
 *  "research — not validated" in the UI. The care team must validate them. */

// ── M2 · gestational diabetes — IADPSG / WHO 2013, 75 g OGTT at 24–28 weeks ──
export interface OgttValues {
  fasting?: number; // mg/dL
  oneHour?: number;
  twoHour?: number;
}

export const GDM_THRESHOLDS = { fasting: 92, oneHour: 180, twoHour: 153 } as const;

/** Any single value at or above its threshold → gestational diabetes. */
export function gestationalDiabetes(v: OgttValues): {
  positive: boolean;
  abnormal: (keyof OgttValues)[];
  complete: boolean;
} {
  const keys: (keyof OgttValues)[] = ["fasting", "oneHour", "twoHour"];
  const abnormal = keys.filter((k) => v[k] != null && (v[k] as number) >= GDM_THRESHOLDS[k]);
  return {
    positive: abnormal.length > 0,
    abnormal,
    complete: keys.every((k) => v[k] != null),
  };
}

/** The OGTT screening window: 24–28 weeks of amenorrhoea (SA). */
export function inOgttWindow(weeks: number | undefined): boolean | null {
  if (weeks == null || Number.isNaN(weeks)) return null;
  return weeks >= 24 && weeks <= 28;
}

// ── M2 · research type classifier ───────────────────────────────────────────
export type Tri = "yes" | "no" | "unknown";

export interface TypeInputs {
  ageAtDiagnosis?: number;
  bmi?: number;
  ketoacidosis: Tri; // DKA at diagnosis
  insulinWithin6Months: Tri;
  autoantibodies: "positive" | "negative" | "unknown"; // GAD / IA-2 / ZnT8
  cPeptide: "low" | "normal" | "unknown";
  familyMultigeneration: Tri; // diabetes in ≥ 2–3 consecutive generations
  duringPregnancy: Tri; // first recognised during pregnancy
  secondaryCause: Tri; // corticosteroids, pancreatic disease, …
  metabolicFeatures: Tri; // hypertension, dyslipidaemia, acanthosis
}

export type DiabetesType = "t1" | "t2" | "lada" | "mody" | "gestational" | "secondary";

export interface TypeResult {
  type: DiabetesType;
  confidence: "low" | "moderate" | "high";
  reasons: string[]; // i18n keys
  nextSteps: string[]; // i18n keys
}

/** Clinical decision tree (ADA classification; LADA per IDS criteria:
 *  adult onset ≥ 30, autoantibodies, no insulin for ≥ 6 months; MODY per
 *  young onset, multigenerational family history, antibody-negative,
 *  preserved C-peptide). */
export function classifyDiabetesType(x: TypeInputs): TypeResult {
  const age = x.ageAtDiagnosis;
  const bmi = x.bmi;

  if (x.duringPregnancy === "yes") {
    return {
      type: "gestational",
      confidence: "high",
      reasons: ["m2.r.pregnancy"],
      nextSteps: ["m2.n.postpartum"],
    };
  }
  if (x.secondaryCause === "yes") {
    return {
      type: "secondary",
      confidence: "moderate",
      reasons: ["m2.r.secondary"],
      nextSteps: ["m2.n.treatCause"],
    };
  }

  if (x.autoantibodies === "positive") {
    const ladaLike = (age ?? 0) >= 30 && x.insulinWithin6Months !== "yes" && x.ketoacidosis !== "yes";
    if (ladaLike) {
      return {
        type: "lada",
        confidence: x.insulinWithin6Months === "no" ? "high" : "moderate",
        reasons: ["m2.r.antibodies", "m2.r.adultOnset", "m2.r.noEarlyInsulin"],
        nextSteps: ["m2.n.monitorBeta"],
      };
    }
    const reasons = ["m2.r.antibodies"];
    if (x.ketoacidosis === "yes") reasons.push("m2.r.dka");
    if (x.cPeptide === "low") reasons.push("m2.r.lowCpeptide");
    if (age != null && age < 30) reasons.push("m2.r.youngOnset");
    return { type: "t1", confidence: "high", reasons, nextSteps: ["m2.n.insulin"] };
  }

  if ((x.ketoacidosis === "yes" || x.cPeptide === "low") && (age == null || age < 30)) {
    const reasons = [];
    if (x.ketoacidosis === "yes") reasons.push("m2.r.dka");
    if (x.cPeptide === "low") reasons.push("m2.r.lowCpeptide");
    if (age != null) reasons.push("m2.r.youngOnset");
    return {
      type: "t1",
      confidence: x.autoantibodies === "negative" ? "low" : "moderate",
      reasons,
      nextSteps: ["m2.n.testAntibodies", "m2.n.insulin"],
    };
  }

  if (
    age != null &&
    age < 35 &&
    x.familyMultigeneration === "yes" &&
    (bmi == null || bmi < 30) &&
    x.ketoacidosis !== "yes" &&
    x.cPeptide !== "low"
  ) {
    return {
      type: "mody",
      confidence: x.autoantibodies === "negative" ? "moderate" : "low",
      reasons: ["m2.r.youngOnset", "m2.r.family", "m2.r.notObese", "m2.r.preservedCpeptide"],
      nextSteps: ["m2.n.genetic"],
    };
  }

  if (
    x.autoantibodies === "unknown" &&
    age != null &&
    age >= 30 &&
    bmi != null &&
    bmi < 25 &&
    x.metabolicFeatures !== "yes"
  ) {
    return {
      type: "lada",
      confidence: "low",
      reasons: ["m2.r.adultOnset", "m2.r.lean", "m2.r.noMetabolic"],
      nextSteps: ["m2.n.testAntibodies"],
    };
  }

  const reasons: string[] = [];
  if (bmi != null && bmi >= 25) reasons.push("m2.r.overweight");
  if (x.metabolicFeatures === "yes") reasons.push("m2.r.metabolic");
  if (age != null && age >= 35) reasons.push("m2.r.olderOnset");
  if (x.insulinWithin6Months === "no") reasons.push("m2.r.noEarlyInsulin");
  return {
    type: "t2",
    confidence: reasons.length >= 3 ? "high" : reasons.length >= 1 ? "moderate" : "low",
    reasons: reasons.length ? reasons : ["m2.r.default"],
    nextSteps: ["m2.n.lifestyle"],
  };
}

// ── M4 · kidney — CKD-EPI 2021 (race-free) + KDIGO heat map ────────────────
/** eGFR (mL/min/1.73 m²) from serum creatinine in mg/dL. */
export function ckdEpi2021(creatinineMgDl: number, age: number, sex: "male" | "female"): number {
  const k = sex === "female" ? 0.7 : 0.9;
  const a = sex === "female" ? -0.241 : -0.302;
  const r = creatinineMgDl / k;
  const egfr =
    142 * Math.min(r, 1) ** a * Math.max(r, 1) ** -1.2 * 0.9938 ** age * (sex === "female" ? 1.012 : 1);
  return Math.round(egfr);
}

export type GStage = "G1" | "G2" | "G3a" | "G3b" | "G4" | "G5";
export type AStage = "A1" | "A2" | "A3";
export type KdigoRisk = "low" | "moderate" | "high" | "veryHigh";

export function gStage(egfr: number): GStage {
  if (egfr >= 90) return "G1";
  if (egfr >= 60) return "G2";
  if (egfr >= 45) return "G3a";
  if (egfr >= 30) return "G3b";
  if (egfr >= 15) return "G4";
  return "G5";
}

/** Albumin/creatinine ratio in mg/g. */
export function aStage(acr: number): AStage {
  if (acr < 30) return "A1";
  if (acr <= 300) return "A2";
  return "A3";
}

const KDIGO: Record<GStage, Record<AStage, KdigoRisk>> = {
  G1: { A1: "low", A2: "moderate", A3: "high" },
  G2: { A1: "low", A2: "moderate", A3: "high" },
  G3a: { A1: "moderate", A2: "high", A3: "veryHigh" },
  G3b: { A1: "high", A2: "veryHigh", A3: "veryHigh" },
  G4: { A1: "veryHigh", A2: "veryHigh", A3: "veryHigh" },
  G5: { A1: "veryHigh", A2: "veryHigh", A3: "veryHigh" },
};

/** KDIGO 2012/2024 prognosis of CKD by GFR and albuminuria category. */
export function kdigoRisk(egfr: number, acr: number): { g: GStage; a: AStage; risk: KdigoRisk } {
  const g = gStage(egfr);
  const a = aStage(acr);
  return { g, a, risk: KDIGO[g][a] };
}

// ── M4 · cardiovascular — ESC 2019 categories for patients with diabetes ────
export interface CvInputs {
  diabetesType: "t1" | "t2";
  age: number;
  durationYears: number;
  establishedCvd: boolean;
  targetOrganDamage: boolean; // proteinuria, eGFR < 30, LVH or retinopathy
  hypertension: boolean;
  dyslipidaemia: boolean;
  smoking: boolean;
  obesity: boolean;
}

export type CvRisk = "moderate" | "high" | "veryHigh";

/** Cosentino et al., 2019 ESC/EASD guidelines, table 7. Patients who fit
 *  neither the very-high nor the moderate definition are rated high. */
export function escCvRisk(x: CvInputs): { risk: CvRisk; reasons: string[] } {
  const factors = [x.hypertension, x.dyslipidaemia, x.smoking, x.obesity, x.age >= 50].filter(Boolean).length;
  const reasons: string[] = [];
  if (x.establishedCvd) reasons.push("m4.cv.r.cvd");
  if (x.targetOrganDamage) reasons.push("m4.cv.r.tod");
  if (factors >= 3) reasons.push("m4.cv.r.threeFactors");
  if (x.diabetesType === "t1" && x.durationYears > 20 && x.age - x.durationYears < 18)
    reasons.push("m4.cv.r.earlyT1");
  if (reasons.length) return { risk: "veryHigh", reasons };

  const young = x.diabetesType === "t1" ? x.age < 35 : x.age < 50;
  const otherFactors = [x.hypertension, x.dyslipidaemia, x.smoking, x.obesity].some(Boolean);
  if (young && x.durationYears < 10 && !otherFactors) {
    return { risk: "moderate", reasons: ["m4.cv.r.young"] };
  }
  return {
    risk: "high",
    reasons: [x.durationYears >= 10 ? "m4.cv.r.duration" : "m4.cv.r.otherFactors"],
  };
}
