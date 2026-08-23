-- Optional Grand Test Paper metadata columns.
-- Existing question values remain untouched.

begin;

alter table public.questions
  add column if not exists source text not null default '',
  add column if not exists year text not null default '';

commit;
