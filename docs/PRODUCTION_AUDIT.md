# Production Audit

## Scope and architecture

The complete tracked repository was inventoried: manifests/lockfile, Express/Vercel configuration, six route modules, middleware, Supabase adapter and SQL schemas, static frontend/importer, scripts, environment template, and git history. There was no pre-existing automated test or CI system.

## Findings

### Critical

- Fixed: invalid, forged, and expired JWTs were decoded and treated as authenticated.
- Fixed: a predictable JWT signing fallback was embedded in source.
- Fixed: a real default administrator email/password pair was embedded and automatically seeded.

### High

- Fixed: permissive wildcard CORS was the default.
- Fixed: login had no brute-force request bound.
- Fixed: npm audit reported a transitive `brace-expansion` denial-of-service vulnerability.
- Open: bearer tokens are stored in local storage and the monolithic frontend contains many HTML sinks. Most interpolations use `escapeHtml`, but a full browser-driven sink proof is not yet present.
- Open: batch import is chunked but not transactional; partial insertion is intentional current behavior and changing it would alter the import contract.

### Medium

- Fixed: baseline security headers were absent.
- Open: audit writes deliberately fail open and are not transactionally coupled to mutations.
- Open: JWT logout records activity but cannot revoke a previously issued stateless token.
- Open: several API database errors expose provider messages.
- Open: user and facet reads may retrieve large datasets; most question and audit endpoints are bounded.

### Low

- Legacy builder artifacts contain invalid/incomplete code but are not referenced by runtime or build scripts.
- Documentation and source contain mojibake from historical encoding conversions.

## Deployment and testing risks

Production needs configured Supabase values, JWT secret, trusted origins, monitoring, backups, and an externally managed initial admin. No isolated Supabase test project or deployed browser target was supplied, so live integration, E2E, responsive, backup/restore, and performance verification remain open.
