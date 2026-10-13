// Screening-photo helpers shared by the patient and doctor pages.

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export type PhotoScanType = "foot" | "neck";

// model labels (vision_service SCAN_CONFIGS) → i18n keys; a labels.json
// with other names falls back to the raw label
const LABEL_KEYS: Record<string, string> = {
  "Abnormal(Ulcer)": "scan.lbl.ulcer",
  "Normal(Healthy skin)": "scan.lbl.healthy",
  normal: "scan.lbl.normal",
  acanthosis_nigricans: "scan.lbl.acanthosis",
  uncertain: "scan.lbl.uncertain",
  "No DR": "ret.grade.0",
  Mild: "ret.grade.1",
  Moderate: "ret.grade.2",
  Severe: "ret.grade.3",
  "Proliferative DR": "ret.grade.4",
};

const POSITIVE = new Set(["Abnormal(Ulcer)", "acanthosis_nigricans", "Moderate", "Severe", "Proliferative DR"]);
const NEGATIVE = new Set(["Normal(Healthy skin)", "normal", "No DR"]);

export function scanLabel(t: Translate, label: string | null | undefined): string {
  if (!label) return "—";
  const key = LABEL_KEYS[label];
  return key ? t(key) : label;
}

/** ok = no sign found, alert = sign found, warn = uncertain / mild. */
export function scanTone(label: string | null | undefined): "ok" | "warn" | "alert" {
  if (label && POSITIVE.has(label)) return "alert";
  if (label && NEGATIVE.has(label)) return "ok";
  return "warn";
}

export const TONE_BADGE = {
  ok: "border-[#bbf7d0] bg-[#dcfce7] text-status-normal",
  warn: "border-[#fde68a] bg-[#fef3c7] text-status-prediabetes",
  alert: "border-[#fecaca] bg-[#fee2e2] text-status-critical",
} as const;

export function confidencePct(confidence: number | null | undefined): string | null {
  return confidence == null ? null : `${(confidence * 100).toFixed(0)} %`;
}

export const MAX_PHOTO_MB = 10;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/** Client-side check before upload: phones often produce HEIC, which the
 *  server cannot decode. Returns an i18n error key, or null when fine. */
export function photoProblem(file: File): string | null {
  if (file.type && !ACCEPTED.includes(file.type)) return "scan.err.format";
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) return "scan.err.size";
  return null;
}
