# Question Bank Portal release handoff

## Current status

`NOT PRODUCTION READY`

The code-level workflow and Viewer deterrence checks pass locally. Production release is blocked until the database migration and real browser role matrix are verified against an isolated staging Supabase project.

## Workflow API contract

| Action | Method | Endpoint | JSON body | Allowed roles |
|---|---|---|---|---|
| Difficulty | `PUT` | `/api/questions/:id/difficulty` | `{"difficulty":"Easy"}` | Admin; same-subject Editor |
| Review | `POST` | `/api/questions/:id/review` | `{"message":"Review message"}` | Admin; same-subject Editor |
| Accept | `POST` | `/api/questions/:id/accept` | `{}` | Admin; same-subject Editor |
Accept is intentionally one-way and idempotent. Repeating Accept reuses the existing accepted notification and does not create a duplicate. There is no user-facing History option or History API.

## Code-level repairs in this handoff

- Workflow and notification routes reject logged-out or revoked sessions.
- The server uses the verified database user as the workflow actor.
- Database permission, validation, missing-function, and availability failures return safe HTTP statuses without provider details.
- Accepted questions no longer offer a misleading “remove acceptance” UI.
- Viewer selection blocking includes `selectstart`, with cleanup on logout and account transitions.
- Safe rollback now writes the exact marker accepted by non-destructive migration reapplication.
- Obsolete, malformed, unreferenced builder, installer, text, and debug artifacts were removed.
- The distributable ZIP excludes `.env`, `.git`, and `node_modules`.

## Required staging gate

Follow `migrations/WORKFLOW_MIGRATION_RUNBOOK.md` using staging-only credentials:

1. Verify a staging backup can be restored.
2. Capture the `before_migration` checkpoint with `05_workflow_checkpoint.sql`.
3. Run `01_workflow_preflight.sql` and stop on unexpected output.
4. Confirm the existing `questions`, `notifications`, `users`, `audit_log`, and `login_history` tables are available. No workflow RPC or additional workflow migration is used.
5. Run `03_workflow_verification.sql` with disposable role and question UUIDs.
6. Run `06_workflow_failure_verification.sql` against disposable data.
7. Test all four actual UI buttons as Admin and same-subject Editor.
8. Confirm Adder, Viewer, cross-subject Editor, unauthenticated, expired, and revoked sessions are denied correctly.
9. Verify repeated Accept, notification recipient isolation, audit consistency, Viewer print preview, watermark, logout, account switching, refresh, mobile layout, and multiple tabs.
10. Run safe rollback, migration reapplication, and verification again.
11. Restore the staging backup and compare stable checkpoints.
12. Run `npm ci`, `npm test`, `npm run lint`, `npm run build`, `npm audit --omit=dev`, and `npm start` with staging configuration.

Do not run migration files against production until every staging gate passes and a current production backup has been independently restored and verified.

## Known limitations

- Viewer controls deter ordinary copying and printing but cannot reliably prevent operating-system screenshots, photography, developer tools, or a determined user.
- The frontend stores its bearer token in `localStorage`; a successful same-origin XSS could read it. The existing content rendering tests reduce risk, but CSP and all dynamic HTML paths still require browser security review before production.
- The `build` script is a JavaScript syntax validation step, not asset bundling or compilation.
