-- ============================================================
-- TicketScan — COMPLETE Supabase Schema (run this ONCE)
-- Paste this entire file into Supabase SQL Editor and click Run.
-- ============================================================

-- 1. Enable pgcrypto extension (Supabase keeps it in "extensions" schema)
create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- 2. TABLES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'teacher', 'volunteer')),
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key,
  max_break_time integer not null default 30,
  grace_time integer not null default 5,
  penalty_per_minute integer not null default 1,
  overdue_email_enabled boolean not null default false,
  jury_mode text not null default 'manual' check (jury_mode in ('manual', 'scan')),
  is_active boolean not null default true,
  event_logo_url text,
  updated_at timestamptz not null default now()
);

insert into public.settings (key)
values ('rules')
on conflict (key) do nothing;

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

create table if not exists public.teams (
  team_id text primary key,
  team_name text not null,
  members_count integer not null default 0,
  room_number text,
  penalty_points integer not null default 0,
  qr_version integer not null default 1,
  active_out jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_emails (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references public.teams(team_id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.break_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references public.teams(team_id) on delete cascade,
  members_out integer not null default 0,
  out_at timestamptz not null default now(),
  in_at timestamptz,
  out_by uuid references auth.users(id),
  in_by uuid references auth.users(id),
  duration_min integer,
  penalty integer not null default 0,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references public.teams(team_id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.penalty_adjustments (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references public.teams(team_id) on delete cascade,
  delta integer not null,
  reason text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_scores (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references public.teams(team_id) on delete cascade,
  teacher_id uuid,  -- nullable, no FK to auth.users (local accounts use user_accounts table)
  teacher_name text,
  problem_understanding integer not null default 0,
  novelty integer not null default 0,
  technical_depth integer not null default 0,
  social_relevance integer not null default 0,
  presentation integer not null default 0,
  github integer not null default 0,
  documentation integer not null default 0,
  total integer not null default 0,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'teacher', 'volunteer')),
  full_name text not null,
  email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scheduled_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  scheduled_at timestamptz not null,
  subject text not null,
  content text not null,
  signature text,
  recipients jsonb not null,
  status text default 'pending' check (status in ('pending', 'sent', 'cancelled', 'failed')),
  from_name text,
  from_email text,
  user_id uuid references auth.users(id)
);

-- ============================================================
-- 3. HELPER FUNCTIONS (role checks)
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'teacher'
  );
$$;

create or replace function public.is_volunteer()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'volunteer')
  );
$$;

create or replace function public.can_view_teams()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'teacher', 'volunteer')
  );
$$;

create or replace function public.can_manage_teacher_scores()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'teacher')
  );
$$;

create or replace function public.can_view_admitted_teams()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'teacher'
  );
$$;

-- ============================================================
-- 4. ACCOUNT MANAGEMENT RPCs (using extensions.crypt)
-- ============================================================

create or replace function public.request_user_account(
  p_username text,
  p_password text,
  p_role text,
  p_full_name text,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_username text := lower(trim(p_username));
begin
  if exists (select 1 from public.user_accounts where lower(username) = v_username) then
    raise exception 'Username already exists';
  end if;

  insert into public.user_accounts (
    username, password_hash, role, full_name, email, status, updated_at
  ) values (
    v_username,
    crypt(p_password, gen_salt('bf')),
    lower(trim(p_role)),
    trim(p_full_name),
    nullif(trim(p_email), ''),
    'pending',
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.approve_user_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_accounts
  set status = 'approved',
      reviewed_at = now(),
      updated_at = now()
  where id = p_account_id;
end;
$$;

create or replace function public.reject_user_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_accounts
  set status = 'rejected',
      reviewed_at = now(),
      updated_at = now()
  where id = p_account_id;
end;
$$;

create or replace function public.authenticate_user_account(p_identifier text, p_password text)
returns table (
  id uuid,
  username text,
  role text,
  full_name text,
  email text,
  status text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
    select
      ua.id,
      ua.username,
      ua.role,
      ua.full_name,
      ua.email,
      ua.status
    from public.user_accounts ua
    where ua.status = 'approved'
      and (
        lower(ua.username) = lower(trim(p_identifier))
        or lower(coalesce(ua.email, '')) = lower(trim(p_identifier))
      )
      and ua.password_hash = crypt(p_password, ua.password_hash)
    limit 1;
end;
$$;

create or replace function public.list_pending_user_accounts()
returns table (
  id uuid,
  username text,
  full_name text,
  role text,
  email text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    ua.id, ua.username, ua.full_name, ua.role, ua.email,
    ua.status, ua.created_at, ua.updated_at
  from public.user_accounts ua
  where ua.status = 'pending'
  order by ua.created_at desc;
$$;

-- ============================================================
-- 5. TEAM OPERATIONS RPCs
-- ============================================================

create or replace function public.mark_out(p_team_id text, p_members_out integer, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  team_row public.teams%rowtype;
  v_out_payload jsonb;
begin
  select * into team_row from public.teams where team_id = p_team_id for update;
  if not found then raise exception 'Team does not exist'; end if;
  if team_row.active_out is not null then raise exception 'Team is already OUT'; end if;

  v_out_payload := jsonb_build_object('out_at', now(), 'members_out', p_members_out, 'actor_uid', p_actor_id);

  update public.teams set active_out = v_out_payload, updated_at = now() where team_id = p_team_id;
  insert into public.break_sessions (team_id, members_out, out_at, out_by, status) values (p_team_id, p_members_out, now(), p_actor_id, 'active');
  insert into public.scan_logs (team_id, action_type, payload, actor_id) values (p_team_id, 'OUT', v_out_payload, p_actor_id);

  return v_out_payload;
end;
$$;

create or replace function public.mark_in(p_team_id text, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  team_row public.teams%rowtype;
  session_row public.break_sessions%rowtype;
  rules_row public.settings%rowtype;
  v_duration_min integer;
  v_overage integer;
  v_penalty integer;
  v_in_payload jsonb;
begin
  select * into team_row from public.teams where team_id = p_team_id for update;
  if not found then raise exception 'Team does not exist'; end if;
  if team_row.active_out is null then raise exception 'Team is not currently OUT'; end if;

  select * into session_row from public.break_sessions
    where team_id = p_team_id and status = 'active' order by out_at desc limit 1;
  if not found then raise exception 'Active session not found'; end if;

  select * into rules_row from public.settings where key = 'rules' limit 1;

  v_duration_min := greatest(0, floor(extract(epoch from (now() - session_row.out_at)) / 60)::int);
  v_overage := greatest(0, v_duration_min - coalesce(rules_row.max_break_time, 30) - coalesce(rules_row.grace_time, 5));
  v_penalty := v_overage * coalesce(rules_row.penalty_per_minute, 1);

  v_in_payload := jsonb_build_object('in_at', now(), 'duration_min', v_duration_min, 'penalty', v_penalty, 'actor_uid', p_actor_id);

  update public.teams set active_out = null, penalty_points = penalty_points + v_penalty, updated_at = now() where team_id = p_team_id;
  update public.break_sessions set in_at = now(), duration_min = v_duration_min, penalty = v_penalty, status = 'closed', in_by = p_actor_id, updated_at = now() where id = session_row.id;
  insert into public.scan_logs (team_id, action_type, payload, actor_id) values (p_team_id, 'IN', v_in_payload, p_actor_id);

  if v_overage > 0 and coalesce(rules_row.overdue_email_enabled, false) then
    perform pg_notify('ticketscan_overdue', jsonb_build_object('team_id', p_team_id, 'duration_min', v_duration_min, 'overage', v_overage)::text);
  end if;

  return v_in_payload;
end;
$$;

create or replace function public.apply_manual_penalty(p_team_id text, p_delta integer, p_reason text, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.teams set penalty_points = penalty_points + p_delta, updated_at = now() where team_id = p_team_id;
  insert into public.penalty_adjustments (team_id, delta, reason, actor_id) values (p_team_id, p_delta, p_reason, p_actor_id);
  insert into public.scan_logs (team_id, action_type, payload, actor_id)
    values (p_team_id, 'manual_penalty', jsonb_build_object('delta', p_delta, 'reason', p_reason), p_actor_id);
end;
$$;

create or replace function public.reset_penalty(p_team_id text, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.teams set penalty_points = 0, updated_at = now() where team_id = p_team_id;
  insert into public.scan_logs (team_id, action_type, payload, actor_id) values (p_team_id, 'reset_penalty', '{}'::jsonb, p_actor_id);
end;
$$;

-- ============================================================
-- 6. GRANTS (allow anon + authenticated to call RPCs)
-- ============================================================

grant execute on function public.request_user_account(text, text, text, text, text) to anon, authenticated;
grant execute on function public.approve_user_account(uuid) to anon, authenticated;
grant execute on function public.reject_user_account(uuid) to anon, authenticated;
grant execute on function public.authenticate_user_account(text, text) to anon, authenticated;
grant execute on function public.list_pending_user_accounts() to anon, authenticated;

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.event_protocols enable row level security;
alter table public.teams enable row level security;
alter table public.team_emails enable row level security;
alter table public.break_sessions enable row level security;
alter table public.scan_logs enable row level security;
alter table public.penalty_adjustments enable row level security;
alter table public.teacher_scores enable row level security;
alter table public.user_accounts enable row level security;
alter table public.scheduled_emails enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles admin write" on public.profiles
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings volunteer read" on public.settings;
create policy "settings volunteer read" on public.settings
for select using (public.is_admin());

drop policy if exists "settings admin write" on public.settings;
create policy "settings admin write" on public.settings
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "event protocols team read" on public.event_protocols;
create policy "event protocols team read" on public.event_protocols
for select using (public.is_admin() or public.is_teacher());

drop policy if exists "event protocols admin write" on public.event_protocols;
create policy "event protocols admin write" on public.event_protocols
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "teams volunteer read" on public.teams;
create policy "teams volunteer read" on public.teams
for select using (
  public.is_admin()
  or public.is_volunteer()
  or (public.can_view_admitted_teams() and is_present = true)
);

drop policy if exists "teams admin write" on public.teams;
create policy "teams admin write" on public.teams
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "team emails volunteer read" on public.team_emails;
create policy "team emails volunteer read" on public.team_emails
for select using (public.is_admin() or public.is_volunteer());

drop policy if exists "team emails admin write" on public.team_emails;
create policy "team emails admin write" on public.team_emails
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "break sessions volunteer read" on public.break_sessions;
create policy "break sessions volunteer read" on public.break_sessions
for select using (public.is_volunteer());

drop policy if exists "break sessions admin write" on public.break_sessions;
create policy "break sessions admin write" on public.break_sessions
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "scan logs volunteer read" on public.scan_logs;
create policy "scan logs volunteer read" on public.scan_logs
for select using (public.is_volunteer());

drop policy if exists "scan logs volunteer insert" on public.scan_logs;
create policy "scan logs volunteer insert" on public.scan_logs
for insert with check (public.is_volunteer());

drop policy if exists "scan logs admin manage" on public.scan_logs;
create policy "scan logs admin manage" on public.scan_logs
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "penalty adjustments volunteer read" on public.penalty_adjustments;
create policy "penalty adjustments volunteer read" on public.penalty_adjustments
for select using (public.is_volunteer());

drop policy if exists "penalty adjustments admin write" on public.penalty_adjustments;
create policy "penalty adjustments admin write" on public.penalty_adjustments
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "teacher scores read" on public.teacher_scores;
create policy "teacher scores read" on public.teacher_scores
for select using (public.can_manage_teacher_scores() or teacher_id = auth.uid());

drop policy if exists "teacher scores insert" on public.teacher_scores;
create policy "teacher scores insert" on public.teacher_scores
for insert with check (public.can_manage_teacher_scores() and teacher_id = auth.uid());

drop policy if exists "teacher scores update" on public.teacher_scores;
create policy "teacher scores update" on public.teacher_scores
for update using (public.can_manage_teacher_scores() and teacher_id = auth.uid())
with check (public.can_manage_teacher_scores() and teacher_id = auth.uid());

drop policy if exists "user accounts admin read" on public.user_accounts;
create policy "user accounts admin read" on public.user_accounts
for select using (public.is_admin());

drop policy if exists "user accounts admin manage" on public.user_accounts;
create policy "user accounts admin manage" on public.user_accounts
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "scheduled emails manage" on public.scheduled_emails;
create policy "scheduled emails manage" on public.scheduled_emails
for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 8. SEED DATA (default accounts)
-- ============================================================

insert into public.user_accounts (username, password_hash, role, full_name, email, status)
values
  ('vikirthan', extensions.crypt('Vikirthan@819', extensions.gen_salt('bf')), 'admin', 'Vikirthan', 'vikirthan@ticketscan.local', 'approved'),
  ('teacher', extensions.crypt('Teacher@819', extensions.gen_salt('bf')), 'teacher', 'Teacher', 'teacher@ticketscan.local', 'approved'),
  ('volunteer', extensions.crypt('Volunteer@819', extensions.gen_salt('bf')), 'volunteer', 'Volunteer', 'volunteer@ticketscan.local', 'approved')
on conflict (username) do nothing;