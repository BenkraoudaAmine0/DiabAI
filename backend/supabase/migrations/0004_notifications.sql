-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0004 — in-app notifications (bell) + Supabase Realtime
-- Run ONCE in Supabase SQL Editor (after 0001–0003).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.notifications (
  id         uuid primary key default gen_random_uuid (),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  kind       text not null check (kind in ('prediction_recorded', 'scan_recorded', 'panel_added')),
  data       jsonb not null default '{}'::jsonb,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_recent_idx on public.notifications (user_id, created_at desc);

-- RLS: users see and update ONLY their own rows. Inserts happen through the
-- backend with the service role (bypasses RLS).
alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid ());

create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid ());

-- Live bell: stream row changes to subscribed clients.
-- (DO block so re-running this file never errors.)
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;  -- already in the publication
end $$;
