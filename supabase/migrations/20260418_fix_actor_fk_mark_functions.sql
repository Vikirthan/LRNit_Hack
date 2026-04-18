-- Make mark_out/mark_in resilient when actor IDs are not from auth.users
-- This prevents FK violations on break_sessions.out_by/in_by and scan_logs.actor_id.

create or replace function public.mark_out(p_team_id text, p_members_out integer, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  team_row public.teams%rowtype;
  v_out_payload jsonb;
  v_actor_id uuid;
begin
  -- Keep actor only if it exists in auth.users; otherwise persist NULL.
  select case
    when p_actor_id is not null and exists (select 1 from auth.users au where au.id = p_actor_id)
      then p_actor_id
    else null
  end into v_actor_id;

  select * into team_row from public.teams where team_id = p_team_id for update;
  if not found then raise exception 'Team does not exist'; end if;
  if team_row.active_out is not null then raise exception 'Team is already OUT'; end if;

  v_out_payload := jsonb_build_object('out_at', now(), 'members_out', p_members_out, 'actor_uid', v_actor_id);

  update public.teams set active_out = v_out_payload, updated_at = now() where team_id = p_team_id;
  insert into public.break_sessions (team_id, members_out, out_at, out_by, status) values (p_team_id, p_members_out, now(), v_actor_id, 'active');
  insert into public.scan_logs (team_id, action_type, payload, actor_id) values (p_team_id, 'OUT', v_out_payload, v_actor_id);

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
  v_actor_id uuid;
begin
  -- Keep actor only if it exists in auth.users; otherwise persist NULL.
  select case
    when p_actor_id is not null and exists (select 1 from auth.users au where au.id = p_actor_id)
      then p_actor_id
    else null
  end into v_actor_id;

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

  v_in_payload := jsonb_build_object('in_at', now(), 'duration_min', v_duration_min, 'penalty', v_penalty, 'actor_uid', v_actor_id);

  update public.teams set active_out = null, penalty_points = penalty_points + v_penalty, updated_at = now() where team_id = p_team_id;
  update public.break_sessions set in_at = now(), duration_min = v_duration_min, penalty = v_penalty, status = 'closed', in_by = v_actor_id, updated_at = now() where id = session_row.id;
  insert into public.scan_logs (team_id, action_type, payload, actor_id) values (p_team_id, 'IN', v_in_payload, v_actor_id);

  if v_overage > 0 and coalesce(rules_row.overdue_email_enabled, false) then
    perform pg_notify('ticketscan_overdue', jsonb_build_object('team_id', p_team_id, 'duration_min', v_duration_min, 'overage', v_overage)::text);
  end if;

  return v_in_payload;
end;
$$;
