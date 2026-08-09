-- READ ONLY. Save this output before approving the migration.
-- This script deliberately makes no schema or data changes.

select current_database() as database_name, current_user, version();
select to_regclass('public.login_history') as login_history_table;

select c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default
from information_schema.columns c
where c.table_schema='public'
  and c.table_name in ('questions','users','audit_log','question_history','notifications','login_history')
order by c.table_name, c.ordinal_position;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace='public'::regnamespace
  and conrelid in (select oid from pg_class where relnamespace='public'::regnamespace
    and relname in ('questions','users','audit_log','question_history','notifications'))
order by 1,2;

select schemaname, tablename, indexname, indexdef
from pg_indexes where schemaname='public'
  and tablename in ('questions','users','audit_log','question_history','notifications')
order by tablename,indexname;

select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) arguments,
       pg_get_functiondef(p.oid) definition, obj_description(p.oid,'pg_proc') comment
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like '%question%workflow%';

select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers where event_object_schema='public'
  and event_object_table in ('questions','question_history','notifications','audit_log')
order by event_object_table,trigger_name;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public'
  and tablename in ('questions','question_history','notifications','audit_log')
order by tablename,policyname;

select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c where c.relnamespace='public'::regnamespace
  and c.relname in ('questions','question_history','notifications','audit_log');

select 'questions' object_name, count(*) row_count from public.questions
union all select 'users',count(*) from public.users
union all select 'audit_log',count(*) from public.audit_log;
do $$ declare n bigint; begin
  if to_regclass('public.login_history') is null then
    raise notice 'public.login_history is absent; session revocation cannot be verified and application readiness must fail';
  else
    execute 'select count(*) from public.login_history' into n;
    raise notice 'login_history row_count=%',n;
  end if;
end $$;

-- Existing/legacy values that must be reviewed, never repaired automatically.
select role,count(*) from public.users group by role order by role;
select subject,count(*) from public.users group by subject order by subject;
do $$ declare r record; begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='questions' and column_name='difficulty') then
    for r in execute 'select difficulty,count(*) n from public.questions group by difficulty order by difficulty'
    loop raise notice 'difficulty=% count=%',r.difficulty,r.n;end loop;
  else raise notice 'public.questions.difficulty is absent';end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='questions' and column_name='review_status') then
    for r in execute 'select review_status,count(*) n from public.questions group by review_status order by review_status'
    loop raise notice 'review_status=% count=%',r.review_status,r.n;end loop;
  else raise notice 'public.questions.review_status is absent';end if;
end $$;

-- Duplicate identifiers should always be zero because the documented keys are primary keys.
select id,count(*) from public.questions group by id having count(*)>1;
select id,count(*) from public.users group by id having count(*)>1;

-- Potential orphan checks for pre-existing workflow tables. Run only when those tables exist.
-- select h.question_id from public.question_history h left join public.questions q on q.id=h.question_id where h.question_id is not null and q.id is null;
-- select n.user_id from public.notifications n left join public.users u on u.id=n.user_id where n.user_id is not null and u.id is null;
-- select n.question_id from public.notifications n left join public.questions q on q.id=n.question_id where n.question_id is not null and q.id is null;

-- Content fingerprints to compare after migration. These do not reveal question content.
select count(*) row_count,
       md5(string_agg(id::text||':'||md5(coalesce(question,'')||coalesce(solution_text,'')),',' order by id)) content_fingerprint
from public.questions;
select count(*) row_count,
       md5(string_agg(id::text||':'||coalesce(role,'')||':'||coalesce(subject,''),',' order by id)) access_fingerprint
from public.users;
