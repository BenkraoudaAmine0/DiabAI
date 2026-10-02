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

export interface PanelPatient extends Profile {
  linked_at: string;
  record_counts: { predictions: number; scans: number };
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
  kind: "prediction_recorded" | "scan_recorded" | "panel_added";
  data: Record<string, string>; // { doctor, scan? } — rendered client-side
  link: string | null;
  read: boolean;
  created_at: string;
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
