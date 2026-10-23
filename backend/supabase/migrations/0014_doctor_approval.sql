-- 0014 — doctors need an administrator's approval
--
-- Anyone can sign up as a doctor. Until an admin approves the account
-- (profiles.verified_at, migration 0013) it only has guest access: the API
-- refuses every doctor action, and these policies make sure the Supabase
-- REST API can't be used to get around it.
--
-- 1. doctor_patients was "for all" for the doctor, so any signed-in user
--    could insert a link to any patient and read that patient's records
--    through the panel policies. Links are now written only by the backend
--    (service role), after its own checks.
-- 2. Every panel policy also requires an approved doctor (or an admin);
--    "(select …)" lets Postgres evaluate it once per query, not per row.

create or replace function public.is_verified_clinician ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid ()
      and (p.role = 'admin' or (p.role = 'doctor' and p.verified_at is not null))
  );
$$;

revoke all on function public.is_verified_clinician () from public;
grant execute on function public.is_verified_clinician () to authenticated;

-- doctor_patients: read-only for users (inserts come from the backend)
drop policy if exists "dp_doctor_all" on public.doctor_patients;
drop policy if exists "dp_doctor_select" on public.doctor_patients;
create policy "dp_doctor_select" on public.doctor_patients
  for select using (doctor_id = auth.uid ());

-- panel access needs an approved doctor
drop policy if exists "profiles_select_panel" on public.profiles;
create policy "profiles_select_panel" on public.profiles
  for select using (
    (select public.is_verified_clinician ())
    and exists (
      select 1 from public.doctor_patients dp
      where dp.doctor_id = auth.uid () and dp.patient_id = profiles.id
    )
  );

drop policy if exists "pred_doctor_panel" on public.predictions;
create policy "pred_doctor_panel" on public.predictions
  for select using (
    (select public.is_verified_clinician ())
    and exists (
      select 1 from public.doctor_patients dp
      where dp.doctor_id = auth.uid () and dp.patient_id = predictions.patient_id
    )
  );

drop policy if exists "scans_doctor_panel" on public.scans;
create policy "scans_doctor_panel" on public.scans
  for select using (
    (select public.is_verified_clinician ())
    and exists (
      select 1 from public.doctor_patients dp
      where dp.doctor_id = auth.uid () and dp.patient_id = scans.patient_id
    )
  );

drop policy if exists "vitals_select" on public.patient_vitals;
create policy "vitals_select" on public.patient_vitals
  for select using (
    patient_id = auth.uid ()
    or (
      (select public.is_verified_clinician ())
      and exists (
        select 1 from public.doctor_patients dp
        where dp.doctor_id = auth.uid () and dp.patient_id = patient_vitals.patient_id
      )
    )
  );

drop policy if exists "notes_select_doctor" on public.consultation_notes;
create policy "notes_select_doctor" on public.consultation_notes
  for select using (
    (select public.is_verified_clinician ())
    and exists (
      select 1 from public.doctor_patients dp
      where dp.doctor_id = auth.uid () and dp.patient_id = consultation_notes.patient_id
    )
  );
