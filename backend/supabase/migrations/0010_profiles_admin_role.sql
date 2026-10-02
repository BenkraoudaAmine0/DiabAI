-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0010 — allow the 'admin' role on existing projects
-- Run ONCE in Supabase SQL Editor.
--
-- Projects initialized from an early 0001_init.sql carry profiles_role_check
-- as check (role in ('doctor', 'patient')): promoting an admin then fails
-- with 23514. This recreates the constraint to match the current 0001
-- definition. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('doctor', 'patient', 'admin'));
