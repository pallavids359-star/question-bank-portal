-- READ ONLY. Run with: -v checkpoint='before_migration' (or another descriptive label).
\if :{?checkpoint}
\else
  \echo 'Missing required psql variable: checkpoint'
  \quit 3
\endif

select :'checkpoint' checkpoint, current_database() database_name, clock_timestamp() captured_at,
       to_regclass('public.login_history') login_history_table;
create temporary table qbp_checkpoint_input as select :'checkpoint'::text label;

-- Core fingerprints intentionally exclude workflow columns. JSONB text has canonical key ordering;
-- rows are ordered by primary key before aggregation.
select :'checkpoint' checkpoint,'questions_core' object_name,count(*) row_count,
       md5(coalesce(string_agg(id::text||':'||md5(to_jsonb(x)::text),',' order by id),'')) fingerprint
from (select id,question,solution_text,subject,type,created_by from public.questions) x;

select :'checkpoint' checkpoint,'users_access' object_name,count(*) row_count,
       md5(coalesce(string_agg(id::text||':'||md5(to_jsonb(x)::text),',' order by id),'')) fingerprint
from (select id,email,role,subject,status,is_active from public.users) x;

select :'checkpoint' checkpoint,'questions_workflow' object_name,count(*) row_count,
       md5(coalesce(string_agg(id::text||':'||md5(to_jsonb(x)::text),',' order by id),'')) fingerprint
from (select id,difficulty,review_status,reviewed_at,reviewed_by,reviewed_by_name,
             review_message,accepted_at,accepted_by,accepted_by_name from public.questions) x;

select :'checkpoint' checkpoint,'question_history' object_name,count(*) row_count,
       md5(coalesce(string_agg(id::text||':'||md5(to_jsonb(x)::text),',' order by id),'')) fingerprint
from (select id,question_id,action,actor_id,actor_name,old_value,new_value,created_at from public.question_history) x;

select :'checkpoint' checkpoint,'notifications' object_name,count(*) row_count,
       md5(coalesce(string_agg(id::text||':'||md5(to_jsonb(x)::text),',' order by id),'')) fingerprint
from (select id,user_id,question_id,type,title,message,sender_name,is_read,created_at from public.notifications) x;

select :'checkpoint' checkpoint,'audit_log' object_name,count(*) row_count,
       md5(coalesce(string_agg(id::text||':'||md5(to_jsonb(x)::text),',' order by id),'')) fingerprint
from (select * from public.audit_log) x;

do $$ declare n bigint; fp text; label text; begin
  select i.label into label from qbp_checkpoint_input i;
  if to_regclass('public.login_history') is null then
    raise notice 'checkpoint=% login_history=ABSENT',label;
  else
    execute $q$select count(*),md5(coalesce(string_agg(id::text||':'||md5(to_jsonb(x)::text),',' order by id),''))
               from (select * from public.login_history) x$q$ into n,fp;
    raise notice 'checkpoint=% object=login_history row_count=% fingerprint=%',label,n,fp;
  end if;
end $$;
