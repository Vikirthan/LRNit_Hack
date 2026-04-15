-- Fix: pgcrypto functions must use extensions.crypt / extensions.gen_salt
-- Run this in Supabase SQL Editor to fix the crypt() error

-- Ensure pgcrypto is enabled (Supabase keeps it in the extensions schema)
create extension if not exists pgcrypto with schema extensions;

-- Recreate request_user_account with extensions.crypt
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
set search_path = public
as $$
declare
  v_id uuid;
  v_username text := lower(trim(p_username));
begin
  if exists (select 1 from public.user_accounts where lower(username) = v_username) then
    raise exception 'Username already exists';
  end if;

  insert into public.user_accounts (
    username,
    password_hash,
    role,
    full_name,
    email,
    status,
    updated_at
  ) values (
    v_username,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
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

-- Recreate authenticate_user_account with extensions.crypt
create or replace function public.authenticate_user_account(p_identifier text, p_password text)
returns table (
  id uuid,
  username text,
  role text,
  full_name text,
  email text,
  status text
)
language sql
security definer
set search_path = public
as $$
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
    and ua.password_hash = extensions.crypt(p_password, ua.password_hash)
  limit 1;
$$;

-- Re-insert seed accounts (using extensions.crypt)
insert into public.user_accounts (username, password_hash, role, full_name, email, status)
values
  ('vikirthan', extensions.crypt('Vikirthan@819', extensions.gen_salt('bf')), 'admin', 'Vikirthan', 'vikirthan@ticketscan.local', 'approved'),
  ('teacher', extensions.crypt('Teacher@819', extensions.gen_salt('bf')), 'teacher', 'Teacher', 'teacher@ticketscan.local', 'approved'),
  ('volunteer', extensions.crypt('Volunteer@819', extensions.gen_salt('bf')), 'volunteer', 'Volunteer', 'volunteer@ticketscan.local', 'approved')
on conflict (username) do nothing;

-- Grant permissions
grant execute on function public.request_user_account(text, text, text, text, text) to anon, authenticated;
grant execute on function public.authenticate_user_account(text, text) to anon, authenticated;
