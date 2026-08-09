# Security Test Report

Tests exercise 100 distinct forged-token shapes, 50 expired tokens, 75 valid signed identities, 30 role-guard combinations, the complete documented permission matrix, 100 valid UUIDs, 100 malformed identifiers, and bounded pagination-style integers across 301 boundary values.

The original forged/expired JWT acceptance defect is now rejected with HTTP 401. Unknown roles fail closed. Valid signed sessions and the existing role/subject compatibility representation remain accepted.

Remaining attack areas requiring an isolated database and browser environment include endpoint-level IDOR/BOLA, SQL/provider error behavior, XSS rendering, CSRF after any cookie migration, concurrency, uploads (none exist in the backend), and end-to-end import behavior.
