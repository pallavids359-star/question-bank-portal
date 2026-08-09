-- Structural verification plus rollback-only behavioral tests.
-- psql variables are mandatory; invalid UUID casts stop execution before BEGIN.
\if :{?admin_id}
\else
  \echo 'Missing required psql variable: admin_id'
  \quit 3
\endif
\if :{?editor_same_id}
\else
  \echo 'Missing required psql variable: editor_same_id'
  \quit 3
\endif
\if :{?editor_other_id}
\else
  \echo 'Missing required psql variable: editor_other_id'
  \quit 3
\endif
\if :{?viewer_id}
\else
  \echo 'Missing required psql variable: viewer_id'
  \quit 3
\endif
\if :{?question_id}
\else
  \echo 'Missing required psql variable: question_id'
  \quit 3
\endif

create temporary table qbp_workflow_verification_input as
select :'admin_id'::uuid admin_id, :'editor_same_id'::uuid editor_same_id,
       :'editor_other_id'::uuid editor_other_id, :'viewer_id'::uuid viewer_id,
       :'question_id'::uuid question_id;
select c.table_name,c.column_name,c.data_type,c.is_nullable
from information_schema.columns c where c.table_schema='public'
 and ((c.table_name='questions' and c.column_name in ('difficulty','review_status','reviewed_at','reviewed_by','reviewed_by_name','review_message','accepted_at','accepted_by','accepted_by_name'))
   or c.table_name in ('question_history','notifications')) order by 1,2;
select p.oid::regprocedure workflow_function,p.proargnames argument_names,
 oidvectortypes(p.proargtypes) argument_types,pg_get_function_result(p.oid) return_type,
 pg_get_userbyid(p.proowner) function_owner,obj_description(p.oid,'pg_proc') version_marker
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='apply_question_workflow';
do $$ declare p pg_proc; begin
  select x.* into p from pg_proc x join pg_namespace n on n.oid=x.pronamespace
    where n.nspname='public' and x.proname='apply_question_workflow'
      and oidvectortypes(x.proargtypes)='uuid, text, uuid, text, jsonb, text';
  if not found then raise exception 'Expected workflow RPC signature is absent';end if;
  if array_to_string(p.proargnames,',')<>'p_question_id,p_action,p_actor_id,p_actor_name,p_value,p_solution_text'
     or p.prorettype<>'public.questions'::regtype
  then raise exception 'Workflow RPC arguments or return type are incompatible';end if;
end $$;
select grantee,privilege_type from information_schema.routine_privileges
 where specific_schema='public' and routine_name='apply_question_workflow' order by grantee,privilege_type;
select c.relname,c.relrowsecurity from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('question_history','notifications');
select grantee,table_name,privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name in ('question_history','notifications') order by 1,2,3;
select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname='public'
 and indexname in ('question_history_question_time_idx','notifications_user_unread_time_idx');

-- Re-run and compare these with saved preflight values.
select 'questions' object_name,count(*) row_count from public.questions
union all select 'users',count(*) from public.users
union all select 'audit_log',count(*) from public.audit_log;
do $$ declare n bigint; begin
  if to_regclass('public.login_history') is null then
    raise notice 'public.login_history is absent; revoked-session enforcement is unavailable and application staging verification must stop';
  else execute 'select count(*) from public.login_history' into n; raise notice 'login_history row_count=%',n; end if;
end $$;
select count(*) row_count,md5(string_agg(id::text||':'||md5(coalesce(question,'')||coalesce(solution_text,'')),',' order by id)) content_fingerprint from public.questions;
select count(*) row_count,md5(string_agg(id::text||':'||coalesce(role,'')||':'||coalesce(subject,''),',' order by id)) access_fingerprint from public.users;
select h.id from public.question_history h left join public.questions q on q.id=h.question_id where h.question_id is not null and q.id is null;
select n.id from public.notifications n left join public.users u on u.id=n.user_id where n.user_id is not null and u.id is null;

-- Every behavioral write is rolled back. Supply disposable staging identifiers only.
begin;
do $$
declare admin_id uuid; editor_same_id uuid; editor_other_id uuid; viewer_id uuid; question_id uuid;
  before_history bigint;before_notifications bigint;before_audit bigint;accepted_history bigint;accepted_audit bigint;
  first_accepted_at timestamptz;q public.questions;
begin
  select i.admin_id,i.editor_same_id,i.editor_other_id,i.viewer_id,i.question_id
    into admin_id,editor_same_id,editor_other_id,viewer_id,question_id from qbp_workflow_verification_input i;
  if admin_id=editor_same_id or admin_id=editor_other_id or admin_id=viewer_id
     or editor_same_id=editor_other_id or editor_same_id=viewer_id or editor_other_id=viewer_id
  then raise exception 'Verification user UUIDs must be distinct'; end if;
  if not exists(select 1 from public.questions where id=question_id) then raise exception 'Disposable staging question not found';end if;
  if not exists(select 1 from public.users where id=admin_id and lower(role)='admin') then raise exception 'admin_id is not an Admin';end if;
  if not exists(select 1 from public.users where id=editor_same_id) then raise exception 'editor_same_id user not found';end if;
  if not exists(select 1 from public.users where id=editor_other_id) then raise exception 'editor_other_id user not found';end if;
  if not exists(select 1 from public.users where id=viewer_id and lower(role)='viewer' and coalesce(subject,'') not like '__EDITOR__:%') then raise exception 'viewer_id is not a Viewer';end if;
  select count(*) into before_history from public.question_history;
  select count(*) into before_notifications from public.notifications;
  select count(*) into before_audit from public.audit_log;
  q:=public.apply_question_workflow(question_id,'difficulty',admin_id,'Staging Admin','"Easy"'::jsonb,null);
  if q.difficulty<>'Easy' then raise exception 'Difficulty result mismatch';end if;
  if (select count(*) from public.question_history)<>before_history+1 then raise exception 'History missing';end if;
  if (select count(*) from public.audit_log)<>before_audit+1 then raise exception 'Audit missing';end if;
  if editor_same_id is not null then perform public.apply_question_workflow(question_id,'review',editor_same_id,'Staging Editor','"Verified review"'::jsonb,null);end if;
  q:=public.apply_question_workflow(question_id,'accept',admin_id,'Staging Admin','true'::jsonb,null);
  first_accepted_at:=q.accepted_at;select count(*) into accepted_history from public.question_history;select count(*) into accepted_audit from public.audit_log;
  q:=public.apply_question_workflow(question_id,'accept',admin_id,'Staging Admin','true'::jsonb,null);
  if q.accepted_at is distinct from first_accepted_at then raise exception 'Repeated Accept changed accepted_at';end if;
  if (select count(*) from public.question_history)<>accepted_history then raise exception 'Repeated Accept duplicated history';end if;
  if (select count(*) from public.audit_log)<>accepted_audit then raise exception 'Repeated Accept duplicated audit';end if;
  if editor_other_id is not null then begin perform public.apply_question_workflow(question_id,'accept',editor_other_id,'Other Editor','true'::jsonb,null);raise exception 'Cross-subject editor was allowed';exception when insufficient_privilege then null;end;end if;
  if viewer_id is not null then begin perform public.apply_question_workflow(question_id,'accept',viewer_id,'Viewer','true'::jsonb,null);raise exception 'Viewer was allowed';exception when insufficient_privilege then null;end;end if;
  raise notice 'Notification delta: %',(select count(*) from public.notifications)-before_notifications;
end $$;
rollback;
