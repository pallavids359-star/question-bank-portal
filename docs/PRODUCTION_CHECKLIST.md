# Production Checklist

## Security

- [x] JWT signature/expiry enforcement
- [x] No embedded signing/admin credentials
- [x] Server-side role and subject enforcement
- [x] Login request limiting
- [x] Restricted CORS and baseline headers
- [ ] Token revocation and logout-all
- [ ] Browser XSS verification and local-storage token migration decision

## Database

- [x] RLS/revocation statements and core indexes documented in schemas
- [ ] Isolated migration rehearsal, transactional audit/import, backups and restore test

## Frontend

- [ ] Automated accessibility, responsive, component, and error-state verification

## Backend

- [x] Bounded question and audit pagination
- [x] Role/subject authorization on sensitive routes
- [ ] Central validation/error schema and provider-error redaction across every route

## Deployment

- [x] Placeholder-only environment example
- [x] CI workflow
- [ ] Production secrets, HTTPS/domain, monitoring, alerting, backup ownership

## Testing

- [x] 831 deterministic unit/security/regression cases passing
- [ ] Isolated database integration, browser E2E, performance, and 90% coverage evidence

## Business Logic Preservation Report

Regression checks cover all four roles across all five subject assignments and confirm unchanged editor compatibility encoding, identity fields, permissions, and access matrix. Question transformation, import, dashboard, audit, and database semantics were not intentionally changed. Invalid/expired authentication, insecure default credentials/CORS, and abusive login traffic were security defects and are now rejected. No production data or schema was modified.
