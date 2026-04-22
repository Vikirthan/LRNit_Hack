-- Migration: Add multi-protocol support for event configuration
-- Creates a dedicated event_protocols table so admins can add multiple protocols
-- and keep only one active at a time.

create table if not exists public.event_protocols (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_break_time integer not null default 30,
  grace_time integer not null default 5,
  penalty_per_minute integer not null default 1,
  overdue_email_enabled boolean not null default false,
  jury_mode text not null default 'manual' check (jury_mode in ('manual', 'scan')),
  is_active boolean not null default false,
  event_logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_protocols_one_active_idx
  on public.event_protocols (is_active)
  where is_active;

insert into public.event_protocols (
  name,
  max_break_time,
  grace_time,
  penalty_per_minute,
  overdue_email_enabled,
  jury_mode,
  is_active,
  event_logo_url
)
select
  'Hackathon Standard',
  max_break_time,
  grace_time,
  penalty_per_minute,
  overdue_email_enabled,
  jury_mode,
  is_active,
  event_logo_url
from public.settings
where key = 'rules'
and not exists (select 1 from public.event_protocols)
on conflict do nothing;

alter table public.event_protocols enable row level security;

drop policy if exists "event protocols team read" on public.event_protocols;
create policy "event protocols team read" on public.event_protocols
for select using (public.can_view_teams());

drop policy if exists "event protocols admin write" on public.event_protocols;
create policy "event protocols admin write" on public.event_protocols
for all using (public.is_admin()) with check (public.is_admin());
