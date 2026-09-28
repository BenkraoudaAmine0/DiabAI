-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI — initial schema
-- Run this ONCE in the Supabase Dashboard → SQL Editor → New query → Run.
-- Requires: pgvector extension available (all Supabase projects have it).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists vector;

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth user. Created automatically by the trigger below.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  role        text not null default 'patient' check (role in ('doctor', 'patient', 'admin')),
  full_name   text,
  dob         date,
  sex         text check (sex in ('male', 'female')),
  phone       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile whenever a user signs up.
-- The signup form passes `role` and `full_name` in the metadata options.
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
    coalesce(new.raw_user_meta_data ->> 'role', 'patient'),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── doctor panel ────────────────────────────────────────────────────────────
create table public.doctor_patients (
  doctor_id   uuid not null references public.profiles (id) on delete cascade,
  patient_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (doctor_id, patient_id),
  check (doctor_id <> patient_id)
);

-- ── diabetes ML predictions ─────────────────────────────────────────────────
create table public.predictions (
  id             uuid primary key default gen_random_uuid (),
  patient_id     uuid not null references public.profiles (id) on delete cascade,
  doctor_id      uuid not null references public.profiles (id) on delete cascade,
  input          jsonb not null,
  probability    double precision not null,
  prediction     int not null check (prediction in (0, 1)),
  risk_tier      text not null,
  top_factors    jsonb,
  waterfall_path text,
  created_at     timestamptz not null default now()
);

-- ── vision scans (foot / neck / eye) ────────────────────────────────────────
create table public.scans (
  id           uuid primary key default gen_random_uuid (),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  patient_id   uuid references public.profiles (id) on delete cascade,
  scan_type    text not null check (scan_type in ('foot', 'neck', 'eye')),
  storage_path text not null,
  result       jsonb,
  created_at   timestamptz not null default now()
);

-- ── RAG chatbot ─────────────────────────────────────────────────────────────
create table public.chat_sessions (
  id         uuid primary key default gen_random_uuid (),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id          uuid primary key default gen_random_uuid (),
  session_id  uuid not null references public.chat_sessions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  sources     jsonb,
  created_at  timestamptz not null default now()
);

-- ── knowledge base (RAG) ────────────────────────────────────────────────────
create table public.kb_documents (
  id           uuid primary key default gen_random_uuid (),
  title        text not null,
  source_url   text,
  storage_path text,
  created_at   timestamptz not null default now()
);

create table public.kb_chunks (
  id          uuid primary key default gen_random_uuid (),
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  chunk_index int not null,
  content     text not null,
  embedding   vector (768) not null
);

create index on public.kb_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Cosine-similarity search used by the chatbot.
create or replace function public.match_kb_chunks (
  query_embedding vector (768),
  match_count   int default 5
)
returns table (
  id          uuid,
  document_id uuid,
  content     text,
  title       text,
  similarity  double precision
)
language sql
stable
as $$
  select c.id,
         c.document_id,
         c.content,
         d.title,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.kb_chunks c
  join public.kb_documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit greatest(1, match_count);
$$;

-- ── storage buckets ─────────────────────────────────────────────────────────
-- Private buckets; the backend (service role) uploads and issues signed URLs.
insert into storage.buckets (id, name, public)
values ('scans', 'scans', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('kb-docs', 'kb-docs', false)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- Writes go through the FastAPI backend with the service-role key (bypasses
-- RLS). These policies protect direct reads from the client.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles        enable row level security;
alter table public.doctor_patients enable row level security;
alter table public.predictions     enable row level security;
alter table public.scans           enable row level security;
alter table public.chat_sessions   enable row level security;
alter table public.chat_messages   enable row level security;
alter table public.kb_documents    enable row level security;
alter table public.kb_chunks       enable row level security;

-- profiles: see yourself; doctors see their panel patients; users can edit self
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid ());

create policy "profiles_select_panel" on public.profiles
  for select using (
    exists (
      select 1 from public.doctor_patients dp
      where dp.doctor_id = auth.uid () and dp.patient_id = profiles.id
    )
  );

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid ());

-- doctor_patients: doctor manages their links; patient sees who linked them
create policy "dp_doctor_all" on public.doctor_patients
  for all using (doctor_id = auth.uid ());

create policy "dp_patient_select" on public.doctor_patients
  for select using (patient_id = auth.uid ());

-- predictions: patient sees their own records; doctor sees records they made
-- OR any record of a panel patient (full clinical history)
create policy "pred_patient_select" on public.predictions
  for select using (patient_id = auth.uid ());

create policy "pred_doctor_own" on public.predictions
  for select using (doctor_id = auth.uid ());

create policy "pred_doctor_panel" on public.predictions
  for select using (
    exists (
      select 1 from public.doctor_patients dp
      where dp.doctor_id = auth.uid () and dp.patient_id = predictions.patient_id
    )
  );

-- scans: same pattern
create policy "scans_patient_select" on public.scans
  for select using (patient_id = auth.uid () or user_id = auth.uid ());

create policy "scans_doctor_panel" on public.scans
  for select using (
    exists (
      select 1 from public.doctor_patients dp
      where dp.doctor_id = auth.uid () and dp.patient_id = scans.patient_id
    )
  );

-- chat: strictly per-user
create policy "chat_sessions_own" on public.chat_sessions
  for all using (user_id = auth.uid ());

create policy "chat_messages_own" on public.chat_messages
  for all using (user_id = auth.uid ());

-- knowledge base: readable by any signed-in user, writable only via backend
create policy "kb_docs_select" on public.kb_documents
  for select using (auth.role () = 'authenticated');

create policy "kb_chunks_select" on public.kb_chunks
  for select using (auth.role () = 'authenticated');
