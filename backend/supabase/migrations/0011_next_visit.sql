-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0011 — next visit date + visit reminders (patient portal, Figma)
-- Run ONCE in Supabase SQL Editor (after 0010). Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- The patient's next clinic visit, set by one of their doctors (backend,
-- service role). Patients read their own row; 0008 keeps it read-only for
-- them (only full_name, phone, dob, sex are updatable from the browser).
alter table public.profiles
  add column if not exists next_visit_at timestamptz;

-- New notification kind: the doctor scheduled / changed the next visit.
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('prediction_recorded', 'scan_recorded', 'panel_added', 'visit_reminder'));
