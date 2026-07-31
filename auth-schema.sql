-- ============================================================
-- Question Bank Portal — Auth Extension Schema
-- Run this ONCE in the Supabase SQL Editor after the main
-- supabase-schema.sql has already been applied.
-- ============================================================

-- ── 1. USERS ─────────────────────────────────────────────────
create table if not exists public.users (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  email           text        unique not null,
  password_hash   text        not null,
  role            text        not null default 'viewer'
                              check (role in ('admin','adder','viewer')),
  status          text        not null default 'active'
                              check (status in ('active','disabled')),
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_login      timestamptz
);

create index if not exists users_email_idx on public.users (email);
create index if not exists users_role_idx  on public.users (role);

-- auto-update updated_at
create or replace function public.set_users_updated_at()
returns trigger language plpgsql security invoker
set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_users_updated_at();

alter table public.users enable row level security;
revoke all on table public.users from anon, authenticated;
grant  all on table public.users to   service_role;


-- ── 2. LOGIN HISTORY ─────────────────────────────────────────
create table if not exists public.login_history (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references public.users(id) on delete set null,
  login_time  timestamptz not null default now(),
  logout_time timestamptz,
  ip_address  text,
  browser     text,
  device      text,
  status      text        not null default 'success'
                          check (status in ('success','failed'))
);

create index if not exists login_history_user_idx on public.login_history (user_id);
create index if not exists login_history_time_idx on public.login_history (login_time desc);

alter table public.login_history enable row level security;
revoke all on table public.login_history from anon, authenticated;
grant  all on table public.login_history to   service_role;


-- ── 3. AUDIT LOG ─────────────────────────────────────────────
create table if not exists public.audit_log (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references public.users(id) on delete set null,
  user_name     text,
  action        text        not null,
  resource_type text,
  resource_id   text,
  details       jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists audit_log_user_idx   on public.audit_log (user_id);
create index if not exists audit_log_action_idx on public.audit_log (action);
create index if not exists audit_log_time_idx   on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;
grant  all on table public.audit_log to   service_role;


-- ── 4. SETTINGS ──────────────────────────────────────────────
create table if not exists public.settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  updated_by uuid        references public.users(id) on delete set null
);

alter table public.settings enable row level security;
revoke all on table public.settings from anon, authenticated;
grant  all on table public.settings to   service_role;

-- Seed default difficulty distribution
insert into public.settings (key, value)
values ('difficulty', '{"easy":45,"medium":35,"hard":20}'::jsonb)
on conflict (key) do nothing;


-- ── 5. ADD OWNERSHIP COLUMNS TO QUESTIONS ────────────────────
alter table public.questions
  add column if not exists created_by      uuid references public.users(id) on delete set null,
  add column if not exists created_by_name text not null default '',
  add column if not exists updated_by      uuid references public.users(id) on delete set null,
  add column if not exists updated_by_name text not null default '';
