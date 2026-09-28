-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0002 — admin: Gemini usage & cost tracking
-- Run ONCE in Supabase SQL Editor (after 0001_init.sql).
-- Adds a NEW table only — does not touch kb_chunks / kb_documents /
-- match_kb_chunks or any other existing object.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.gemini_usage (
  id                 uuid primary key default gen_random_uuid (),
  user_id            uuid references public.profiles (id) on delete set null,
  kind               text not null check (kind in ('generate', 'embedding')),
  model              text not null,
  input_tokens       bigint not null default 0,
  output_tokens      bigint not null default 0,
  estimated_cost_usd double precision not null default 0,
  detail             jsonb,
  created_at         timestamptz not null default now()
);

create index on public.gemini_usage (created_at);

-- RLS enabled with no policies: locked to everyone except the backend
-- (service role bypasses RLS). The admin reads it through /api/admin/stats.
alter table public.gemini_usage enable row level security;
