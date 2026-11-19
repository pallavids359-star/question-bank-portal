-- =====================================================================
-- Question Bank Portal
-- Chapter / Concept name management (add, rename, merge, delete)
--
-- RUN THIS ONLY IN THE CONTROL SUPABASE PROJECT.
-- Additive and idempotent: creates one new table. It does not change or
-- delete any existing table, question, user, session or audit row.
--
-- Each row adjusts the built-in NCERT chapter list or the suggested concept
-- list for one Subject + Class:
--   kind = 'chapter', state = 'added'   -> chapter appears in the dropdowns
--   kind = 'chapter', state = 'removed' -> chapter is hidden from dropdowns
--   kind = 'concept', state = 'added'   -> concept suggested for that chapter
-- With no rows the portal behaves exactly as before.
-- =====================================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.taxonomy_overrides (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('chapter', 'concept')),
  subject text not null,
  klass text not null,
  chapter text not null default '',
  name text not null,
  state text not null default 'added' check (state in ('added', 'removed')),
  created_by uuid,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, subject, klass, chapter, name)
);

alter table public.taxonomy_overrides enable row level security;
revoke all on table public.taxonomy_overrides from anon, authenticated;
grant all on table public.taxonomy_overrides to service_role;

create index if not exists taxonomy_overrides_scope_idx
  on public.taxonomy_overrides(subject, klass, kind);

notify pgrst, 'reload schema';

commit;

-- Verification: should return one row named taxonomy_overrides.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'taxonomy_overrides';
