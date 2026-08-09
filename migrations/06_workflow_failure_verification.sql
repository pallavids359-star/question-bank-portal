-- STAGING ONLY. Induces reversible failures; every block ends with ROLLBACK.
\if :{?admin_id}
\else
  \echo 'Missing required psql variable: admin_id'
  \quit 3
\endif
\if :{?question_id}
\else
  \echo 'Missing required psql variable: question_id'
  \quit 3
\endif

create temporary table qbp_failure_input as
select :'admin_id'::uuid admin_id, :'question_id'::uuid question_id;

create or replace function pg_temp.qbp_fail_insert() returns trigger language plpgsql as $$
begin raise exception using errcode='P0001',message='QBP_STAGING_INDUCED_FAILURE';end $$;

-- History insertion failure.
begin;
create trigger qbp_staging_fail_history before insert on public.question_history
for each row execute function pg_temp.qbp_fail_insert();
do $$ declare i record; before_q jsonb; after_q jsonb; h bigint;n bigint;a bigint; failed boolean=false; begin
  select * into i from qbp_failure_input;
  select to_jsonb(q) into before_q from public.questions q where q.id=i.question_id;
  select count(*) into h from public.question_history;select count(*) into n from public.notifications;select count(*) into a from public.audit_log;
  begin perform public.apply_question_workflow(i.question_id,'difficulty',i.admin_id,'ignored','"Easy"'::jsonb,null);
  exception when sqlstate 'P0001' then failed=true;end;
  if not failed then raise exception 'History failure was not induced';end if;
  select to_jsonb(q) into after_q from public.questions q where q.id=i.question_id;
  if before_q is distinct from after_q or h<>(select count(*) from public.question_history)
     or n<>(select count(*) from public.notifications) or a<>(select count(*) from public.audit_log)
  then raise exception 'History failure left a partial workflow mutation';end if;
end $$;
rollback;

-- Notification insertion failure. The disposable question must have a different non-null creator.
begin;
create trigger qbp_staging_fail_notification before insert on public.notifications
for each row execute function pg_temp.qbp_fail_insert();
do $$ declare i record; before_q jsonb; after_q jsonb; h bigint;n bigint;a bigint; failed boolean=false; begin
  select * into i from qbp_failure_input;
  if not exists(select 1 from public.questions where id=i.question_id and created_by is not null and created_by<>i.admin_id)
  then raise exception 'Notification test requires a question created by another staging user';end if;
  select to_jsonb(q) into before_q from public.questions q where q.id=i.question_id;
  select count(*) into h from public.question_history;select count(*) into n from public.notifications;select count(*) into a from public.audit_log;
  begin perform public.apply_question_workflow(i.question_id,'difficulty',i.admin_id,'ignored','"Medium"'::jsonb,null);
  exception when sqlstate 'P0001' then failed=true;end;
  if not failed then raise exception 'Notification failure was not induced';end if;
  select to_jsonb(q) into after_q from public.questions q where q.id=i.question_id;
  if before_q is distinct from after_q or h<>(select count(*) from public.question_history)
     or n<>(select count(*) from public.notifications) or a<>(select count(*) from public.audit_log)
  then raise exception 'Notification failure left a partial workflow mutation';end if;
end $$;
rollback;

-- Audit insertion failure.
begin;
create trigger qbp_staging_fail_audit before insert on public.audit_log
for each row execute function pg_temp.qbp_fail_insert();
do $$ declare i record; before_q jsonb; after_q jsonb; h bigint;n bigint;a bigint; failed boolean=false; begin
  select * into i from qbp_failure_input;
  select to_jsonb(q) into before_q from public.questions q where q.id=i.question_id;
  select count(*) into h from public.question_history;select count(*) into n from public.notifications;select count(*) into a from public.audit_log;
  begin perform public.apply_question_workflow(i.question_id,'difficulty',i.admin_id,'ignored','"Hard"'::jsonb,null);
  exception when sqlstate 'P0001' then failed=true;end;
  if not failed then raise exception 'Audit failure was not induced';end if;
  select to_jsonb(q) into after_q from public.questions q where q.id=i.question_id;
  if before_q is distinct from after_q or h<>(select count(*) from public.question_history)
     or n<>(select count(*) from public.notifications) or a<>(select count(*) from public.audit_log)
  then raise exception 'Audit failure left a partial workflow mutation';end if;
end $$;
rollback;
