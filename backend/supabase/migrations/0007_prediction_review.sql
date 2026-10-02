-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0007 — diabetes predictions: doctor review + clinical interpretation
-- Run ONCE in Supabase SQL Editor (after 0006_kb_rich_content.sql).
--
-- * status: every new prediction is 'pending' until a doctor confirms or
--   rejects it on the report page. Patients only see CONFIRMED predictions
--   (API and RLS below) — an unvalidated model score is never shown to them.
--   Predictions made before this migration start as 'pending' too: confirm
--   them from the patient's page to share them with the patient again.
-- * interpretation: the "clinical interpretation" paragraph written by
--   Gemini for the report, and the language it was written in.
-- Additive except for the patient read policy, which is replaced.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.predictions
  add column if not exists status              text not null default 'pending'
                                               check (status in ('pending', 'confirmed', 'rejected')),
  add column if not exists review_note         text,
  add column if not exists reviewed_by         uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at         timestamptz,
  add column if not exists interpretation      text,
  add column if not exists interpretation_lang text check (interpretation_lang in ('en', 'fr'));

-- patients: own records, confirmed ones only
drop policy if exists "pred_patient_select" on public.predictions;
create policy "pred_patient_select" on public.predictions
  for select using (patient_id = auth.uid () and status = 'confirmed');
