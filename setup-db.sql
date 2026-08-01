-- ============================================================
-- Question Bank Portal — Complete Database Setup Script
-- Paste and run this script in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/vznhcbwrssbqvnihysys/sql/new
-- ============================================================

create extension if not exists pgcrypto;

-- ── 1. QUESTIONS TABLE ──────────────────────────────────────
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  klass text not null,
  chapter text not null,
  topic text not null,
  exams text[] not null default '{}',
  q_type text not null check (
    q_type in (
      'mcq_single',
      'assertion_reason',
      'match',
      'numerical',
      'true_false'
    )
  ),
  question text not null default '',
  opt_a text not null default '',
  opt_b text not null default '',
  opt_c text not null default '',
  opt_d text not null default '',
  assertion text not null default '',
  reason text not null default '',
  predef_options text not null default '',
  column_a text[] not null default '{}',
  column_b text[] not null default '{}',
  match_options jsonb not null default '{"A":"","B":"","C":"","D":""}'::jsonb,
  num_answer text not null default '',
  correct_option text not null default '',
  solution_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker
set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists questions_set_updated_at on public.questions;
create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

alter table public.questions enable row level security;
revoke all on table public.questions from anon, authenticated;
grant all on table public.questions to service_role;

create index if not exists questions_subject_idx on public.questions (subject);
create index if not exists questions_q_type_idx  on public.questions (q_type);


-- ── 2. USERS TABLE ──────────────────────────────────────────
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


-- ── 3. LOGIN HISTORY TABLE ──────────────────────────────────
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


-- ── 4. AUDIT LOG TABLE ──────────────────────────────────────
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


-- ── 5. SETTINGS TABLE ───────────────────────────────────────
create table if not exists public.settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  updated_by uuid        references public.users(id) on delete set null
);

alter table public.settings enable row level security;
revoke all on table public.settings from anon, authenticated;
grant  all on table public.settings to   service_role;

insert into public.settings (key, value)
values ('difficulty', '{"easy":45,"medium":35,"hard":20}'::jsonb)
on conflict (key) do nothing;


-- ── 6. ADD OWNERSHIP & METADATA COLUMNS TO QUESTIONS ─────────
alter table public.questions
  add column if not exists created_by      uuid references public.users(id) on delete set null,
  add column if not exists created_by_name text not null default '',
  add column if not exists updated_by      uuid references public.users(id) on delete set null,
  add column if not exists updated_by_name text not null default '',
  add column if not exists difficulty     text not null default 'Medium',
  add column if not exists marks          text not null default '4',
  add column if not exists neg_marks      text not null default '1',
  add column if not exists language       text not null default 'English',
  add column if not exists source         text not null default '',
  add column if not exists author         text not null default '',
  add column if not exists reference_book text not null default '',
  add column if not exists status         text not null default 'Published',
  add column if not exists tags           text not null default '',
  add column if not exists year           text not null default '',
  add column if not exists attempt_level  text not null default '',
  add column if not exists board          text not null default '';

