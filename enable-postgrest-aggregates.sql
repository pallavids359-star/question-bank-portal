-- Run this once in the NEW Supabase project's SQL Editor.
-- It enables read-only PostgREST aggregate queries used by the dashboard and
-- question-filter endpoints. It does not change tables or question records.

ALTER ROLE authenticator SET pgrst.db_aggregates_enabled = 'true';
NOTIFY pgrst, 'reload config';
