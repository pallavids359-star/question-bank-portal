# Workflow staging runbook

Status: **NOT PRODUCTION READY**. These files have not been executed against an isolated staging database.

## Safety and prerequisites

Use a separate staging project, sanitized disposable data, a restore-tested backup, and a PostgreSQL role authorized for staging migrations. Confirm the target before every step:

```powershell
$env:STAGING_DATABASE_URL = '<staging-only PostgreSQL connection string>'
psql "$env:STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -c "select current_database(),current_user,inet_server_addr(),version();"
```

`public.questions`, `public.users`, and `public.audit_log` are migration prerequisites. `public.login_history` is not a migration prerequisite, and preflight checks it with `to_regclass`. However, it is a security prerequisite for this application: when present, workflow requests validate the JWT `loginHistoryId`, user, successful status, and null `logout_time`; when absent, the backend returns a generic session-validation failure, `/health` is not ready, and direct server startup refuses to listen. Do not bypass this failure. Install the tracked authentication schema before application testing.

Authentication uses `Authorization: Bearer` tokens stored by the browser in local storage. The repository contains no authentication-cookie setter or parser. Therefore `NODE_ENV=production` does not set `Secure` cookies, no cookie override environment variable exists, and plain localhost does not lose authentication because of cookie attributes. Prefer HTTPS staging because bearer tokens still require transport protection. Expected authentication response cookie attributes: none; no `Set-Cookie` header.

## Lifecycle

Run the following only against staging:

1. Capture `before_migration` with `05_workflow_checkpoint.sql`.
2. Run `01_workflow_preflight.sql`; save and review all output.
3. Apply `02_workflow_migration.sql`.
4. Capture `after_migration`.
5. Run parameterized `03_workflow_verification.sql`; it validates UUID casts and rolls back behavioral writes.
6. Capture `after_behavior_rollback`; core and all mutable fingerprints must equal `after_migration`.
7. Run browser/API tests, then capture `after_browser_tests`. Only explicitly exercised workflow rows may differ.
8. Run `06_workflow_failure_verification.sql`; all three induced failures must report no exception and leave no data change.
9. Run `04_workflow_safe_rollback.sql`, then capture `after_safe_rollback`. Data fingerprints must equal `after_browser_tests`; only the function marker/grant changes.
10. Re-run `02_workflow_migration.sql`. It accepts exactly `QBP_WORKFLOW_V1` or the rollback-created `QBP_WORKFLOW_V1_DISABLED`, rejects every other marker, recreates the intended function, revokes browser-role execution, and grants execution only to `service_role`.
11. Re-run parameterized verification and capture `after_reenable`.
12. Restore the backup into a disposable project and capture `after_backup_restore`; compare it with the original pre-migration checkpoint.

Migration does not drop workflow tables/columns or delete question, history, notification, or audit data. Safe rollback only revokes function execution and changes its marker. Never uncomment the destructive examples.

Reapplication is structurally supported by code, but remains **unverified** until steps 9–11 pass against isolated staging.

## Commands

```powershell
psql "$env:STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -v checkpoint='before_migration' -f "E:\question-bank-portal\migrations\05_workflow_checkpoint.sql"
psql "$env:STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "E:\question-bank-portal\migrations\01_workflow_preflight.sql"
psql "$env:STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "E:\question-bank-portal\migrations\02_workflow_migration.sql"
psql "$env:STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -v checkpoint='after_migration' -f "E:\question-bank-portal\migrations\05_workflow_checkpoint.sql"

psql "$env:STAGING_DATABASE_URL" `
  -v ON_ERROR_STOP=1 `
  -v admin_id='<uuid>' `
  -v editor_same_id='<uuid>' `
  -v editor_other_id='<uuid>' `
  -v viewer_id='<uuid>' `
  -v question_id='<uuid>' `
  -f "E:\question-bank-portal\migrations\03_workflow_verification.sql"

psql "$env:STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -v admin_id='<uuid>' -v question_id='<uuid>' -f "E:\question-bank-portal\migrations\06_workflow_failure_verification.sql"
psql "$env:STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "E:\question-bank-portal\migrations\04_workflow_safe_rollback.sql"
```

Run `05_workflow_checkpoint.sql` at every named checkpoint. It uses ordered primary keys, canonical JSONB text, and explicit stable fields for core question/user fingerprints. Workflow fingerprints are separate so expected workflow mutations can be distinguished from unauthorized changes to core records. `login_history` is fingerprinted dynamically only when it exists.

## RPC, grants, and RLS inspection

The backend invokes `apply_question_workflow` with named arguments `p_question_id`, `p_action`, `p_actor_id`, `p_actor_name`, `p_value`, and `p_solution_text`. The intended database signature and return are `(uuid,text,uuid,text,jsonb,text) returns public.questions`.

```sql
select p.oid::regprocedure,pg_get_function_result(p.oid),pg_get_userbyid(p.proowner) owner,
       obj_description(p.oid,'pg_proc') marker
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='apply_question_workflow';

select grantee,privilege_type
from information_schema.routine_privileges
where specific_schema='public' and routine_name='apply_question_workflow'
order by grantee,privilege_type;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where schemaname='public' and tablename in ('questions','question_history','notifications','audit_log');
```

Expected: only `service_role` can execute the function; `public`, `anon`, and `authenticated` cannot. Workflow tables have RLS enabled and browser roles have no direct table grants. The function independently reloads the active actor and enforces Admin/Editor role and Editor subject.

## Permission matrix

| Role | Difficulty | Review | Accept | History |
|---|---|---|---|---|
| Admin | Allow | Allow | Allow | Allow |
| Adder | 403 | 403 | 403 | 403 |
| Same-subject Editor | Allow | Allow | Allow | Allow |
| Cross-subject Editor | 403 | 403 | 403 | 403 |
| Viewer | 403 | 403 | 403 | 403 |

`requireAuth` rejects missing/invalid tokens with 401. `loadAuthorizedWorkflowQuestion` validates the live session, calls `canUseWorkflow` for each action—including History independently—and calls `hasSubjectAccess`. Mutations are rechecked inside `public.apply_question_workflow`; History is a backend-filtered table read and is never inferred from mutation access.

## Failure and isolation tests

`06_workflow_failure_verification.sql` installs transaction-local failing triggers separately on history, notifications, and audit. Each induced exception is caught, the complete question row and all three table counts are compared, and the surrounding transaction is rolled back. The notification case requires a disposable question whose non-null creator differs from the Admin actor.

Browser tests must additionally prove notification queries are restricted to `req.user.userId`, History requires authorization for that question, invalid UUID returns 400, missing question returns 404, repeated Accept is idempotent, revoked sessions return 401, and unknown `/api/*` returns structured JSON 404. Provider/SQL/JWT/configuration/table names and stack traces must never appear in responses. Record actual status bodies and database checkpoints; code inspection is not a passing staging result.
