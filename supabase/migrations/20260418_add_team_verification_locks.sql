alter table if exists public.teams
  add column if not exists github_verified boolean not null default false,
  add column if not exists documentation_verified boolean not null default false;
