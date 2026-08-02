create extension if not exists pgcrypto;

-- Drop old restrictive q_type check constraint if present
alter table public.questions drop constraint if exists questions_q_type_check;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null default 'General',
  klass text not null default '11',
  chapter text not null default 'General',
  topic text not null default 'General',
  exams text[] not null default '{}',
  q_type text not null default 'mcq_single',

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
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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

create index if not exists questions_subject_idx
  on public.questions (subject);

create index if not exists questions_q_type_idx
  on public.questions (q_type);

alter table public.questions
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

