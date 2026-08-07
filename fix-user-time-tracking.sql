-- Run once in the SQL Editor for the live Supabase project.
-- This does not delete or replace any existing data.

alter table public.login_history
  add column if not exists last_activity_at timestamptz,
  add column if not exists duration_seconds bigint not null default 0;

update public.login_history
set last_activity_at = coalesce(last_activity_at, logout_time, login_time)
where last_activity_at is null;

create index if not exists login_history_user_activity_idx
  on public.login_history (user_id, last_activity_at desc);

notify pgrst, 'reload schema';

select id, user_id, login_time, logout_time, last_activity_at, duration_seconds
from public.login_history
order by login_time desc
limit 20;
