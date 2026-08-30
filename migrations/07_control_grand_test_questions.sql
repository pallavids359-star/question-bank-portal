-- =====================================================================
-- Question Bank Portal
-- Control DB storage for Grand Test / Full Syllabus questions
--
-- RUN THIS ONLY IN THE CONTROL SUPABASE PROJECT.
-- It is additive/idempotent and does not delete or rewrite users, sessions,
-- notifications, audit logs, or existing question rows.
-- =====================================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null default 'General',
  klass text not null default 'Full Syllabus',
  chapter text not null default 'Full Syllabus',
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
  statement1 text not null default '',
  statement2 text not null default '',
  predef_options text not null default '',
  column_a text[] not null default '{}',
  column_b text[] not null default '{}',
  match_options jsonb not null default '{"A":"","B":"","C":"","D":""}'::jsonb,
  num_answer text not null default '',

  correct_option text not null default '',
  solution_text text not null default '',

  difficulty text not null default 'Medium',
  marks text not null default '4',
  neg_marks text not null default '1',
  language text not null default 'English',

  source text not null default '',
  author text not null default '',
  reference_book text not null default '',
  status text not null default 'Published',
  tags text not null default '',
  year text not null default '',
  attempt_level text not null default '',
  board text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid,
  created_by_name text not null default '',
  updated_by uuid,
  updated_by_name text not null default '',

  review_status text default 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid,
  reviewed_by_name text,
  review_message text,

  accepted_at timestamptz,
  accepted_by uuid,
  accepted_by_name text
);

-- Upgrade an existing questions table without touching current values.
alter table public.questions
  add column if not exists subject text not null default 'General',
  add column if not exists klass text not null default 'Full Syllabus',
  add column if not exists chapter text not null default 'Full Syllabus',
  add column if not exists topic text not null default 'General',
  add column if not exists exams text[] not null default '{}',
  add column if not exists q_type text not null default 'mcq_single',
  add column if not exists question text not null default '',
  add column if not exists opt_a text not null default '',
  add column if not exists opt_b text not null default '',
  add column if not exists opt_c text not null default '',
  add column if not exists opt_d text not null default '',
  add column if not exists assertion text not null default '',
  add column if not exists reason text not null default '',
  add column if not exists statement1 text not null default '',
  add column if not exists statement2 text not null default '',
  add column if not exists predef_options text not null default '',
  add column if not exists column_a text[] not null default '{}',
  add column if not exists column_b text[] not null default '{}',
  add column if not exists match_options jsonb not null default '{"A":"","B":"","C":"","D":""}'::jsonb,
  add column if not exists num_answer text not null default '',
  add column if not exists correct_option text not null default '',
  add column if not exists solution_text text not null default '',
  add column if not exists difficulty text not null default 'Medium',
  add column if not exists marks text not null default '4',
  add column if not exists neg_marks text not null default '1',
  add column if not exists language text not null default 'English',
  add column if not exists source text not null default '',
  add column if not exists author text not null default '',
  add column if not exists reference_book text not null default '',
  add column if not exists status text not null default 'Published',
  add column if not exists tags text not null default '',
  add column if not exists year text not null default '',
  add column if not exists attempt_level text not null default '',
  add column if not exists board text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid,
  add column if not exists created_by_name text not null default '',
  add column if not exists updated_by uuid,
  add column if not exists updated_by_name text not null default '',
  add column if not exists review_status text default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_by_name text,
  add column if not exists review_message text,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid,
  add column if not exists accepted_by_name text;

-- Keep all control DB question storage server-side.
alter table public.questions enable row level security;
revoke all on table public.questions from anon, authenticated;
grant all on table public.questions to service_role;

create index if not exists control_gt_questions_subject_idx
  on public.questions(subject);

create index if not exists control_gt_questions_class_idx
  on public.questions(klass);

create index if not exists control_gt_questions_source_year_idx
  on public.questions(source, year);

create index if not exists control_gt_questions_created_at_idx
  on public.questions(created_at desc);

-- Standard updated_at behavior.
create or replace function public.set_control_gt_question_updated_at()
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

drop trigger if exists control_gt_questions_set_updated_at on public.questions;
create trigger control_gt_questions_set_updated_at
before update on public.questions
for each row execute function public.set_control_gt_question_updated_at();

notify pgrst, 'reload schema';

commit;

-- Verification: should return the questions table plus all expected GT columns.
select
  table_name,
  count(*) as column_count
from information_schema.columns
where table_schema = 'public'
  and table_name = 'questions'
group by table_name;

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'questions'
  and column_name in (
    'subject','klass','chapter','topic','q_type','question',
    'source','year','created_by','review_status','accepted_at'
  )
order by column_name;
