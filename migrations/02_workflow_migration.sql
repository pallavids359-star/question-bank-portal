-- ADDITIVE MIGRATION. Apply to staging only after reviewing 01 output and backups.
begin;

-- Fail rather than silently accepting incompatible pre-existing workflow tables.
do $$
declare bad text;
begin
  if to_regclass('public.questions') is null or to_regclass('public.users') is null or to_regclass('public.audit_log') is null then
    raise exception 'Required base table is missing (questions, users, or audit_log)';
  end if;
  if to_regclass('public.question_history') is not null then
    if coalesce(obj_description('public.question_history'::regclass,'pg_class'),'')<>'QBP_WORKFLOW_V1' then
      raise exception 'Existing public.question_history is not marked QBP_WORKFLOW_V1; review it manually';end if;
    select string_agg(v.name,', ') into bad from (values
      ('id','uuid'),('question_id','uuid'),('action','text'),('actor_id','uuid'),
      ('actor_name','text'),('old_value','jsonb'),('new_value','jsonb'),('created_at','timestamp with time zone')
    ) v(name,typ) where not exists (select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name='question_history' and c.column_name=v.name and c.data_type=v.typ);
    if bad is not null then raise exception 'Incompatible public.question_history columns: %',bad; end if;
  end if;
  if to_regclass('public.notifications') is not null then
    if coalesce(obj_description('public.notifications'::regclass,'pg_class'),'')<>'QBP_WORKFLOW_V1' then
      raise exception 'Existing public.notifications is not marked QBP_WORKFLOW_V1; review it manually';end if;
    select string_agg(v.name,', ') into bad from (values
      ('id','uuid'),('user_id','uuid'),('question_id','uuid'),('type','text'),('title','text'),
      ('message','text'),('sender_name','text'),('is_read','boolean'),('created_at','timestamp with time zone')
    ) v(name,typ) where not exists (select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name='notifications' and c.column_name=v.name and c.data_type=v.typ);
    if bad is not null then raise exception 'Incompatible public.notifications columns: %',bad; end if;
  end if;
end $$;

-- Existing same-named question columns must have the expected type.
do $$ declare bad text; begin
  select string_agg(v.name,', ') into bad from (values
    ('difficulty','text'),('review_status','text'),('reviewed_at','timestamp with time zone'),
    ('reviewed_by','uuid'),('reviewed_by_name','text'),('review_message','text'),
    ('accepted_at','timestamp with time zone'),('accepted_by','uuid'),('accepted_by_name','text')
  ) v(name,typ) where exists(select 1 from information_schema.columns c where c.table_schema='public'
    and c.table_name='questions' and c.column_name=v.name and c.data_type<>v.typ);
  if bad is not null then raise exception 'Incompatible public.questions workflow columns: %',bad;end if;
end $$;

-- Nullable columns preserve unknown legacy state and do not rewrite existing rows.
alter table public.questions add column if not exists difficulty text;
alter table public.questions add column if not exists review_status text;
alter table public.questions add column if not exists reviewed_at timestamptz;
alter table public.questions add column if not exists reviewed_by uuid references public.users(id) on delete set null;
alter table public.questions add column if not exists reviewed_by_name text;
alter table public.questions add column if not exists review_message text;
alter table public.questions add column if not exists accepted_at timestamptz;
alter table public.questions add column if not exists accepted_by uuid references public.users(id) on delete set null;
alter table public.questions add column if not exists accepted_by_name text;

create table if not exists public.question_history (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.questions(id) on delete set null,
  action text not null check(action in ('DIFFICULTY_CHANGED','REVIEWED','ACCEPTED')),
  actor_id uuid references public.users(id) on delete set null,
  actor_name text not null default '', old_value jsonb not null default '{}'::jsonb,
  new_value jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.users(id) on delete set null,
  question_id uuid references public.questions(id) on delete set null, type text not null,
  title text not null default 'Question Review', message text not null, sender_name text not null default '',
  is_read boolean not null default false, created_at timestamptz not null default now()
);
comment on table public.question_history is 'QBP_WORKFLOW_V1';
comment on table public.notifications is 'QBP_WORKFLOW_V1';

alter table public.question_history enable row level security;
alter table public.notifications enable row level security;
revoke all on public.question_history,public.notifications from public,anon,authenticated;
grant select,insert on public.question_history to service_role;
grant select,insert,update on public.notifications to service_role;

-- These non-unique indexes support history and current-user notification routes.
do $$ begin
  if to_regclass('public.question_history_question_time_idx') is not null
     and pg_get_indexdef('public.question_history_question_time_idx'::regclass) not ilike '%(question_id, created_at DESC)%'
  then raise exception 'Incompatible question_history_question_time_idx';end if;
  if to_regclass('public.notifications_user_unread_time_idx') is not null
     and pg_get_indexdef('public.notifications_user_unread_time_idx'::regclass) not ilike '%(user_id, is_read, created_at DESC)%'
  then raise exception 'Incompatible notifications_user_unread_time_idx';end if;
end $$;
create index if not exists question_history_question_time_idx on public.question_history(question_id,created_at desc);
create index if not exists notifications_user_unread_time_idx on public.notifications(user_id,is_read,created_at desc);

-- Refuse to replace an unknown function with the same signature. The exact disabled
-- marker is produced only by 04_workflow_safe_rollback.sql and is safe to re-enable.
do $$ begin
  if to_regprocedure('public.apply_question_workflow(uuid,text,uuid,text,jsonb,text)') is not null
     and coalesce(obj_description(to_regprocedure('public.apply_question_workflow(uuid,text,uuid,text,jsonb,text)'),'pg_proc'),'')
         not in ('QBP_WORKFLOW_V1','QBP_WORKFLOW_V1_DISABLED')
  then raise exception 'Existing apply_question_workflow function has an unknown or incompatible version marker'; end if;
end $$;

create or replace function public.apply_question_workflow(
  p_question_id uuid,p_action text,p_actor_id uuid,p_actor_name text,p_value jsonb,p_solution_text text default null
) returns public.questions language plpgsql security definer set search_path=''
as $$
declare q public.questions; actor public.users; logical_role text; actor_subject text;
  old_data jsonb; new_data jsonb; history_action text; notification_message text;
begin
  select * into actor from public.users where id=p_actor_id and status='active' and is_active=true;
  if not found then raise exception using errcode='42501',message='Actor is not active'; end if;
  logical_role:=lower(coalesce(actor.role,'')); actor_subject:=coalesce(actor.subject,'All');
  if logical_role='viewer' and actor_subject like '__EDITOR__:%' then
    logical_role:='editor'; actor_subject:=substr(actor_subject,length('__EDITOR__:')+1);
  end if;
  if logical_role not in ('admin','editor') then raise exception using errcode='42501',message='Workflow permission denied'; end if;
  select * into q from public.questions where id=p_question_id for update;
  if not found then raise exception using errcode='P0002',message='Question not found'; end if;
  if logical_role<>'admin' and lower(coalesce(actor_subject,''))<>'all'
     and lower(case when q.subject='Maths' then 'Mathematics' else q.subject end)<>
         lower(case when actor_subject='Maths' then 'Mathematics' else actor_subject end)
  then raise exception using errcode='42501',message='Subject permission denied'; end if;
  old_data:=jsonb_build_object('difficulty',q.difficulty,'reviewStatus',q.review_status,
    'reviewMessage',q.review_message,'solutionText',q.solution_text);
  if p_action='difficulty' then
    if p_value #>> '{}' not in ('Easy','Medium','Hard') then raise exception using errcode='22023',message='Invalid difficulty'; end if;
    update public.questions set difficulty=p_value #>> '{}',solution_text=coalesce(p_solution_text,solution_text),
      updated_by=actor.id,updated_by_name=coalesce(actor.name,''),updated_at=now()
      where id=q.id returning * into q;
    history_action:='DIFFICULTY_CHANGED'; notification_message:='Question difficulty changed to '||(p_value #>> '{}')||'.';
  elsif p_action='review' then
    if length(btrim(p_value #>> '{}')) not between 1 and 2000 then raise exception using errcode='22023',message='Invalid review message'; end if;
    update public.questions set review_status=case when review_status='accepted' then 'accepted' else 'reviewed' end,
      review_message=btrim(p_value #>> '{}'),reviewed_at=now(),reviewed_by=actor.id,
      reviewed_by_name=coalesce(actor.name,''),updated_at=now() where id=q.id returning * into q;
    history_action:='REVIEWED'; notification_message:='Your question received a review.';
  elsif p_action='accept' then
    if jsonb_typeof(p_value)<>'boolean' or not (p_value #>> '{}')::boolean then raise exception using errcode='22023',message='Invalid acceptance value'; end if;
    if q.review_status='accepted' then return q; end if;
    update public.questions set review_status='accepted',accepted_at=now(),accepted_by=actor.id,
      accepted_by_name=coalesce(actor.name,''),updated_at=now() where id=q.id returning * into q;
    history_action:='ACCEPTED';notification_message:='Your question was accepted.';
  else raise exception using errcode='22023',message='Unsupported workflow action'; end if;
  new_data:=jsonb_build_object('difficulty',q.difficulty,'reviewStatus',q.review_status,'reviewMessage',q.review_message,'solutionText',q.solution_text);
  insert into public.question_history(question_id,action,actor_id,actor_name,old_value,new_value)
    values(q.id,history_action,actor.id,coalesce(actor.name,''),old_data,new_data);
  if q.created_by is not null and q.created_by<>actor.id then
    insert into public.notifications(user_id,question_id,type,title,message,sender_name)
      values(q.created_by,q.id,history_action,'Question Review',notification_message,coalesce(actor.name,''));
  end if;
  insert into public.audit_log(user_id,user_name,action,resource_type,resource_id,details)
    values(actor.id,coalesce(actor.name,''),history_action,'question',q.id::text,new_data);
  return q;
end $$;
comment on function public.apply_question_workflow(uuid,text,uuid,text,jsonb,text) is 'QBP_WORKFLOW_V1';
revoke all on function public.apply_question_workflow(uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.apply_question_workflow(uuid,text,uuid,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
