# Testing Strategy

The project uses the Node.js built-in test runner for deterministic, dependency-light checks. The current suite executes 831 cases: 536 unit cases for permissions, bounded integers, and identifiers; 255 authentication/security cases for forged, valid, expired tokens and role denial; and 40 regression cases covering every existing role/subject encoding combination.

`npm test`, `npm run test:security`, and `npm run test:regression` are available. CI also runs lint/syntax checks, dependency audit, and build checks.

Coverage instrumentation, isolated Supabase integration tests, DOM component tests, and browser E2E tests are not yet implemented. Therefore the requested category distribution and 90% coverage thresholds have not been demonstrated even though the total meaningful case count exceeds 600.
