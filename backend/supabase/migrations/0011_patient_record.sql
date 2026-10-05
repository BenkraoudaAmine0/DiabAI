-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0011 — patient record for the doctor profile page (Figma
-- "patient-profile"): administrative identifiers, vitals / lab values and
-- consultation notes. Run ONCE in Supabase SQL Editor (after 0010).
-- Safe to re-run. Writes go through the FastAPI backend (service role).
-- ═══════════════════════════════════════════════════════════════════════════

-- Insurance identifiers + blood group. Patients cannot edit them: 0008 only
-- grants UPDATE on (full_name, phone, dob, sex). The national ID number shown
-- in the Figma is deliberately NOT stored (data minimisation, Loi 18-07).
alter table public.profiles
  add column if not exists cnas_number text,
  add column if not exists chifa_number text,
  add column if not exists blood_group text,
  -- doctor settings (Figma "settings · Mon Profil Professionnel")
  add column if not exists specialty text,
  add column if not exists license_number text;

do $$
begin
  alter table public.profiles
    add constraint profiles_blood_group_check
    check (blood_group is null or blood_group in ('O+','O-','A+','A-','B+','B-','AB+','AB-'));
exception
  when duplicate_object then null;
end $$;

-- Vitals and lab values measured at a consultation.
create table if not exists public.patient_vitals (
  id              uuid primary key default gen_random_uuid (),
  patient_id      uuid not null references public.profiles (id) on delete cascade,
  recorded_by     uuid references public.profiles (id) on delete set null,
  measured_at     timestamptz not null default now(),
  systolic        integer check (systolic between 50 and 300),
  diastolic       integer check (diastolic between 30 and 200),
  weight_kg       numeric(5, 1) check (weight_kg between 1 and 500),
  height_cm       numeric(5, 1) check (height_cm between 30 and 260),
  fasting_glucose numeric(6, 1) check (fasting_glucose between 20 and 1000),
  hba1c           numeric(4, 1) check (hba1c between 2 and 25),
  egfr            numeric(5, 1) check (egfr between 1 and 200),
  acr             numeric(7, 1) check (acr between 0 and 10000),
  created_at      timestamptz not null default now()
);

create index if not exists patient_vitals_patient_idx
  on public.patient_vitals (patient_id, measured_at desc);

-- Consultation notes — clinician-only.
create table if not exists public.consultation_notes (
  id          uuid primary key default gen_random_uuid (),
  patient_id  uuid not null references public.profiles (id) on delete cascade,
  doctor_id   uuid references public.profiles (id) on delete set null,
  body        text not null check (char_length(body) between 1 and 5000),
  created_at  timestamptz not null default now()
);

create index if not exists consultation_notes_patient_idx
  on public.consultation_notes (patient_id, created_at desc);

-- RLS: read access only (inserts come from the backend's service role).
alter table public.patient_vitals enable row level security;
alter table public.consultation_notes enable row level security;

drop policy if exists "vitals_select" on public.patient_vitals;
create policy "vitals_select" on public.patient_vitals
  for select using (
    patient_id = auth.uid ()
    or exists (
      select 1 from public.doctor_patients dp
      where dp.doctor_id = auth.uid () and dp.patient_id = patient_vitals.patient_id
    )
  );

drop policy if exists "notes_select_doctor" on public.consultation_notes;
create policy "notes_select_doctor" on public.consultation_notes
  for select using (
    exists (
      select 1 from public.doctor_patients dp
      where dp.doctor_id = auth.uid () and dp.patient_id = consultation_notes.patient_id
    )
  );

-- Clinician decision on a retinal (or foot / neck) scan — Figma
-- "retinal-result · Validation de l'Action Clinique".
alter table public.scans
  add column if not exists review_status text,
  add column if not exists reviewed_label text,
  add column if not exists referred boolean not null default false,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz;

do $$
begin
  alter table public.scans
    add constraint scans_review_status_check
    check (review_status is null or review_status in ('confirmed', 'modified'));
exception
  when duplicate_object then null;
end $$;
