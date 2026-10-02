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

export interface PredictionResult {
  record_id: string;
  probability: number;
  probability_pct: string;
  prediction: number;
  result_label: string;
  risk_tier: string;
  top_factors: TopFactor[];
  waterfall_url: string | null;
  created_at: string | null;
}

export interface PredictionRow extends Partial<PredictionResult> {
  id: string;
  patient_id: string;
  doctor_id: string;
  input: Record<string, unknown>;
  waterfall_path?: string | null;
  created_at: string;
  doctor?: { full_name: string | null } | null;
  patient?: { full_name: string | null } | null;
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

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { index: number; title: string; excerpt: string; similarity: number }[] | null;
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
