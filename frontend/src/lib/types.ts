export type Role = "doctor" | "patient" | "admin";

export interface Profile {
  id: string;
  email: string | null;
  role: Role;
  full_name: string | null;
  dob: string | null;
  sex: "male" | "female" | null;
  phone: string | null;
  created_by: string | null;
  created_at?: string;
  next_visit_at?: string | null; // migration 0010 — set by a doctor
}

export interface TopFactor {
  feature: string;
  value: number;
  direction: string;
}

export type ReviewStatus = "pending" | "confirmed" | "rejected";

export interface PredictionResult {
  record_id: string;
  probability: number;
  probability_pct: string;
  prediction: number;
  result_label: string;
  risk_tier: string;
  top_factors: TopFactor[];
  factors: TopFactor[];
  threshold: number | null;
  status: ReviewStatus;
  waterfall_url: string | null;
  created_at: string | null;
}

export interface PredictionInput {
  patient_id: string;
  gender: "male" | "female";
  age: number;
  hypertension: boolean;
  heart_disease: boolean;
  smoking_history: string;
  bmi: number;
  HbA1c_level: number;
  blood_glucose_level: number;
}

/** A predictions row as returned by the history endpoints. */
export interface PredictionRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  input: PredictionInput;
  probability: number;
  prediction: number;
  risk_tier: string;
  top_factors: TopFactor[] | null; // all factors, strongest first
  status?: ReviewStatus; // missing before migration 0007
  waterfall_path?: string | null;
  waterfall_url?: string | null;
  created_at: string;
  doctor?: { full_name: string | null } | null;
  patient?: { full_name: string | null } | null;
}

export type ValueStatus = "normal" | "elevated" | "high";

export interface ClinicalValue {
  key: string;
  value: number | boolean | string;
  unit: string | null;
  status: ValueStatus;
}

/** GET /api/diabetes/predictions/{id} */
export interface PredictionReport {
  prediction: {
    id: string;
    patient_id: string;
    doctor_id: string;
    input: PredictionInput;
    probability: number;
    probability_pct: string;
    prediction: number;
    result_label: string;
    risk_tier: string;
    status: ReviewStatus;
    review_note: string | null;
    reviewed_at: string | null;
    reviewer_name: string | null;
    doctor_name: string | null;
    interpretation: string | null;
    interpretation_lang: "en" | "fr" | null;
    factors: TopFactor[];
    top_factors: TopFactor[];
    threshold: number | null;
    values: ClinicalValue[];
    waterfall_url: string | null;
    created_at: string;
  };
  patient: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    sex?: "male" | "female" | null;
    dob?: string | null;
  };
  can_review: boolean;
}

export interface ScanResult {
  scan_id: string;
  scan_type: string;
  label: string; // class name or "uncertain"
  top_class?: string | null;
  uncertain?: boolean;
  confidence: number;
  probabilities: Record<string, number>;
  referable_dr_probability?: number | null;
  referable_dr?: boolean | null;
  disclaimer?: string | null;
  image_url: string | null;
  created_at: string | null;
}

export interface ScanRow {
  id: string;
  user_id: string;
  patient_id: string | null;
  scan_type: "foot" | "neck" | "eye";
  storage_path: string;
  result: {
    label?: string;
    top_class?: string;
    uncertain?: boolean;
    confidence?: number;
    probabilities?: Record<string, number>;
    referable_dr_probability?: number;
    referable_dr?: boolean;
    disclaimer?: string;
  } | null;
  created_at: string;
  image_url?: string;
  operator?: { full_name: string | null } | null;
  subject?: { full_name: string | null } | null;
}

/** Clinical status from the latest prediction (backend services/clinical). */
export type ClinicalStatus = "diabetic" | "prediabetic" | "moderate" | "normal" | "none";

export interface PanelPatient extends Profile {
  linked_at: string;
  record_counts: { predictions: number; scans: number };
  age: number | null;
  status: ClinicalStatus;
  latest_prediction: {
    id: string;
    probability: number;
    prediction: number;
    risk_tier: string;
    status?: ReviewStatus;
    created_at: string;
  } | null;
  last_activity_at: string | null;
  pending_reviews: number;
}

export interface PatientSearchResult {
  id: string;
  full_name: string | null;
  email: string | null;
  age: number | null;
  sex: "male" | "female" | null;
  status: ClinicalStatus;
  last_activity_at: string | null;
}

/** A prediction or scan of a panel patient (dashboard / history). */
export interface ActivityItem {
  kind: "prediction" | "scan";
  id: string;
  patient_id: string;
  patient_name: string;
  age: number | null;
  created_at: string;
  link: string;
  // prediction
  status?: ClinicalStatus;
  review?: ReviewStatus | null;
  probability?: number;
  // scan
  scan_type?: "foot" | "neck" | "eye";
  label?: string | null;
  referable?: boolean | null;
  confidence?: number | null;
}

export interface UrgentAlert {
  reason: "glucose" | "hba1c" | "referable_dr";
  value: number | null;
  kind: "prediction" | "scan";
  id: string;
  patient_id: string;
  patient_name: string;
  age: number | null;
  created_at: string;
  link: string;
}

export interface DoctorDashboard {
  kpis: {
    patients: { total: number; new_this_week: number };
    evaluations: { this_week: number; last_week: number };
    retinal: { total: number; positive_to_review: number };
    reviews: { pending: number; urgent: number };
  };
  recent: ActivityItem[];
  alerts: UrgentAlert[];
}

export interface ChatSource {
  index: number;
  title: string;
  excerpt: string;
  similarity: number;
  page?: string | null; // PDF sources: printed page label or page number
  chapter?: string | null; // books (PDF outline / EPUB table of contents)
  content_type?: "table" | "figure" | null; // null = running text
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[] | null;
  created_at: string;
}

export interface ChatSession {
  id: string;
  title: string | null;
  created_at: string;
}

// ── notifications ────────────────────────────────────────────────────────────
export interface NotificationItem {
  id: string;
  kind: "prediction_recorded" | "scan_recorded" | "panel_added" | "visit_reminder";
  data: Record<string, string>; // { doctor, scan?, at? } — rendered client-side
  link: string | null;
  read: boolean;
  created_at: string;
}

// ── patient portal ───────────────────────────────────────────────────────────
export interface CareTeamDoctor {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

/** GET /api/records/me/summary */
export interface PatientSummary {
  last_check_at: string | null;
  next_visit_at: string | null;
  doctors: CareTeamDoctor[];
}

// ── admin ────────────────────────────────────────────────────────────────────
export interface UsageSummary {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

export interface AdminStats {
  counts: { doctors: number; patients: number; admins: number };
  storage: Record<string, { objects: number; bytes: number }>;
  gemini: {
    totals: UsageSummary;
    generate: UsageSummary;
    embedding: UsageSummary;
    last_call: string | null;
  };
}

export type KbKind = "document" | "book";
export type KbStatus = "processing" | "ready" | "failed";

export interface KbDocument {
  id: string;
  title: string;
  kind: KbKind;
  status: KbStatus;
  error: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  author: string | null;
  page_count: number | null;
  chunk_count: number | null;
  chunks_embedded: number;
  storage_path: string | null;
  // what was read besides the text (migration 0006)
  extraction?: {
    tables: number;
    figures: number;
    ocr_pages: number;
    images_skipped: number;
  } | null;
  // model that embedded it, e.g. "local:google/embeddinggemma-300m" (0009)
  embedding_model?: string | null;
  created_at: string;
  uploader?: { full_name: string | null } | null;
}

export interface KbLimits {
  document_mb: number;
  book_mb: number;
}

export interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
  counts: {
    predictions_made: number;
    predictions_received: number;
    scans_performed: number;
    scans_received: number;
  };
}

// ── doctor › patient profile (migration 0011) ───────────────────────────────
export type BloodGroup = "O+" | "O-" | "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-";

export interface PatientVitals {
  id: string;
  measured_at: string;
  systolic: number | null;
  diastolic: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  fasting_glucose: number | null;
  hba1c: number | null;
  egfr: number | null;
  acr: number | null;
}

export interface ConsultationNote {
  id: string;
  body: string;
  created_at: string;
  doctor?: { full_name: string | null } | null;
}

/** GET /api/patients/{id}/clinical */
export interface PatientClinical {
  identifiers: { cnas_number: string | null; chifa_number: string | null; blood_group: BloodGroup | null };
  vitals: PatientVitals[];
  notes: ConsultationNote[];
  migrated: boolean;
}
