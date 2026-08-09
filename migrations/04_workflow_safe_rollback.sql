-- SAFE BEHAVIORAL ROLLBACK. Preserves all question, user, history, notification and audit data.
begin;
do $$ begin
  if to_regprocedure('public.apply_question_workflow(uuid,text,uuid,text,jsonb,text)') is not null then
    execute 'revoke execute on function public.apply_question_workflow(uuid,text,uuid,text,jsonb,text) from service_role';
    comment on function public.apply_question_workflow(uuid,text,uuid,text,jsonb,text)
      is 'QBP_WORKFLOW_V1_DISABLED';
  end if;
end $$;
notify pgrst,'reload schema';
commit;

-- MANUAL DESTRUCTIVE CLEANUP — DO NOT RUN WITHOUT BACKUP AND APPROVAL
-- The following is intentionally documentation only. Do not uncomment after workflow data exists.
-- drop function public.apply_question_workflow(uuid,text,uuid,text,jsonb,text);
-- drop table public.notifications;
-- drop table public.question_history;
-- alter table public.questions drop column ...;
