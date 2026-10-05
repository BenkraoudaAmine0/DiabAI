-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0012 — security & administration backend (Figma 05 Admin Screens +
-- doctor settings). Run ONCE in Supabase SQL Editor (after 0011). Safe to
-- re-run.
--   • audit_log        append-only, hash-chained activity trail
--   • app_errors       error alerts with a triage workflow
--   • deletion_requests account deletion requests (handled by an admin)
--   • model_registry   ML model versions, status and metrics
--   • app_settings     platform security settings (2FA policy)
--   • profiles         doctor verification + facility
-- All writes go through the FastAPI backend (service role); RLS lets nobody
-- read these tables from the browser except a user's own deletion request.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── audit log ───────────────────────────────────────────────────────────────
-- actor_id has no foreign key on purpose: rows must survive account deletion
-- unchanged (actor_name keeps who it was).
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  chain_seq   bigint unique,
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  action      text not null,          -- e.g. prediction.create, patient.link, user.role
  target_type text,                   -- prediction | scan | profile | kb_document | …
  target_id   text,
  detail      jsonb not null default '{}'::jsonb,
  ip          text,
  created_at  timestamptz not null default now(),
  prev_hash   text,
  hash        text
);
create index if not exists audit_log_recent_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

-- One digest definition shared by the insert trigger and the verifier.
create or replace function public.audit_row_digest(
  prev text, row_id bigint, actor uuid, act text, ttype text, tid text,
  info jsonb, at timestamptz
) returns text
language sql stable
set search_path = public, extensions
as $$
  select encode(extensions.digest(
    prev || '|' || row_id::text || '|' || coalesce(actor::text, '') || '|' || act
      || '|' || coalesce(ttype, '') || '|' || coalesce(tid, '') || '|' || info::text
      || '|' || to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'sha256'), 'hex')
$$;

-- Each row stores the hash of the previous one: editing any row breaks the
-- chain, which /api/admin/audit/integrity detects.
create or replace function public.audit_log_chain() returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  last_seq bigint;
  last_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('diabai_audit_chain'));
  select chain_seq, hash into last_seq, last_hash
    from public.audit_log order by chain_seq desc nulls last limit 1;
  new.chain_seq := coalesce(last_seq, 0) + 1;
  new.prev_hash := coalesce(last_hash, 'genesis');
  new.hash := public.audit_row_digest(new.prev_hash, new.id, new.actor_id, new.action,
    new.target_type, new.target_id, new.detail, new.created_at);
  return new;
end $$;

drop trigger if exists audit_log_chain on public.audit_log;
create trigger audit_log_chain before insert on public.audit_log
  for each row execute function public.audit_log_chain();

-- Append-only: no edits, no deletions (not even with the service role).
create or replace function public.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

create or replace function public.audit_verify_chain()
returns table (total bigint, broken bigint, first_broken bigint, last_hash text)
language plpgsql stable
set search_path = public, extensions
as $$
declare
  r record;
  prev text := 'genesis';
  n bigint := 0;
  b bigint := 0;
  fb bigint := null;
begin
  for r in select * from public.audit_log order by chain_seq loop
    n := n + 1;
    if r.prev_hash is distinct from prev
       or r.hash is distinct from public.audit_row_digest(r.prev_hash, r.id, r.actor_id,
            r.action, r.target_type, r.target_id, r.detail, r.created_at) then
      b := b + 1;
      fb := coalesce(fb, r.id);
    end if;
    prev := r.hash;
  end loop;
  return query select n, b, fb, case when n = 0 then null else prev end;
end $$;

revoke execute on function public.audit_verify_chain() from public, anon, authenticated;
grant execute on function public.audit_verify_chain() to service_role;

-- ── error alerts ────────────────────────────────────────────────────────────
create table if not exists public.app_errors (
  id          bigint generated always as identity primary key,
  level       text not null default 'high' check (level in ('low', 'medium', 'high', 'critical')),
  status      text not null default 'open' check (status in ('open', 'investigating', 'resolved')),
  source      text not null,          -- api route or service
  message     text not null,
  detail      jsonb not null default '{}'::jsonb,
  user_id     uuid references public.profiles (id) on delete set null,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists app_errors_recent_idx on public.app_errors (created_at desc);
create index if not exists app_errors_status_idx on public.app_errors (status, created_at desc);

-- ── account deletion requests ───────────────────────────────────────────────
create table if not exists public.deletion_requests (
  id          uuid primary key default gen_random_uuid (),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  reason      text check (reason is null or char_length(reason) <= 2000),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  handled_by  uuid references public.profiles (id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists deletion_requests_status_idx on public.deletion_requests (status, created_at desc);

-- ── model registry ──────────────────────────────────────────────────────────
create table if not exists public.model_registry (
  id            uuid primary key default gen_random_uuid (),
  name          text not null check (char_length(name) between 1 and 120),
  version       text not null check (char_length(version) between 1 and 40),
  task          text not null default 'other'
                check (task in ('diabetes_risk', 'retina', 'foot', 'neck', 'embeddings', 'llm', 'other')),
  status        text not null default 'candidate'
                check (status in ('candidate', 'staging', 'validated', 'production', 'monitoring', 'retired')),
  metrics       jsonb not null default '{}'::jsonb,   -- e.g. {"AUC": 0.93, "Recall": 0.91}
  artifact      text,                                  -- file name on the API server
  sha256        text,
  notes         text check (notes is null or char_length(notes) <= 2000),
  registered_by uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (name, version)
);

-- ── platform settings ───────────────────────────────────────────────────────
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value)
  values ('require_mfa_privileged', 'false'::jsonb)
  on conflict (key) do nothing;

-- ── doctor verification + facility ──────────────────────────────────────────
alter table public.profiles add column if not exists verified_at timestamptz;
alter table public.profiles add column if not exists verified_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists facility text;
alter table public.profiles drop constraint if exists profiles_facility_len;
alter table public.profiles add constraint profiles_facility_len
  check (facility is null or char_length(facility) <= 120);

-- ── sign-up details (Figma register page) ────────────────────────────────────
-- Same role rule as 0008 (a signup can only be doctor or patient); also keeps
-- the phone, date of birth (patients) and registration number + facility
-- (doctors) entered on the register page.
create or replace function public.try_date(value text)
returns date
language plpgsql
immutable
as $$
begin
  return value::date;
exception when others then
  return null;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  signup_role text := case when meta ->> 'role' in ('doctor', 'patient') then meta ->> 'role' else 'patient' end;
begin
  insert into public.profiles (id, email, role, full_name, phone, dob, license_number, facility)
  values (
    new.id,
    new.email,
    signup_role,
    coalesce(meta ->> 'full_name', split_part(new.email, '@', 1)),
    nullif(left(meta ->> 'phone', 30), ''),
    case when signup_role = 'patient' then public.try_date(meta ->> 'dob') end,
    case when signup_role = 'doctor' then nullif(left(meta ->> 'license_number', 64), '') end,
    case when signup_role = 'doctor' then nullif(left(meta ->> 'facility', 120), '') end
  );
  return new;
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.audit_log enable row level security;
alter table public.app_errors enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.model_registry enable row level security;
alter table public.app_settings enable row level security;

-- a user may see their own deletion request (status shown in their settings)
drop policy if exists "deletion_select_own" on public.deletion_requests;
create policy "deletion_select_own" on public.deletion_requests
  for select using (user_id = auth.uid ());
