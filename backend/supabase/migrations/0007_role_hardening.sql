-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0007 — close two privilege escalations on public.profiles
-- Run ONCE in Supabase SQL Editor (after 0006_prediction_review.sql).
--
-- 1. handle_new_user copied `role` from the signup metadata, and the check
--    constraint allows 'admin': anyone calling supabase.auth.signUp() with
--    the public anon key and data {role: 'admin'} became an administrator.
--    Signups can now only be 'doctor' or 'patient'.
-- 2. The "profiles_update_own" policy let a signed-in user update EVERY
--    column of their own row from the browser — including role (patient →
--    admin) and email (which /api/patients/link looks patients up by).
--    Users may now only edit full_name, phone, dob and sex. All other writes
--    go through the FastAPI backend (service role), which is unaffected, and
--    promoting an admin from the SQL Editor (README) still works.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    new.email,
    case
      when new.raw_user_meta_data ->> 'role' in ('doctor', 'patient')
        then new.raw_user_meta_data ->> 'role'
      else 'patient'
    end,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

-- Accounts created before 0001 was applied have no profile row: the app
-- then can't load them. Create the missing ones (same rules as signup).
insert into public.profiles (id, email, role, full_name)
select u.id,
       u.email,
       case
         when u.raw_user_meta_data ->> 'role' in ('doctor', 'patient')
           then u.raw_user_meta_data ->> 'role'
         else 'patient'
       end,
       coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- column-level privileges: the RLS policy still limits users to their own row
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, dob, sex) on public.profiles to authenticated;

-- Review existing accounts: anyone who used hole 1 or 2 shows up here.
-- select id, email, role, created_at from public.profiles where role = 'admin';
