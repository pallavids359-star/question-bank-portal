# Security Model

Bearer JWTs are accepted only after HS256 signature and expiry verification. Production requires a unique JWT secret of at least 32 characters. Initial administration credentials are opt-in environment values and are never embedded in source. Login requests are bounded per IP/account. CORS is allow-list based; same-origin requests work without configuration. Responses receive anti-sniffing, framing, referrer, permissions, CSP, and production HSTS headers.

Supabase credentials are server-only. RLS denies anonymous and authenticated browser roles while granting the service role. Consequently every server route must authenticate and authorize before accessing records. Question routes additionally enforce subject access on list, read, create, batch, and update operations.

Known risk: browser bearer tokens remain in local storage, which increases impact of any frontend XSS. Moving to HttpOnly cookies requires coordinated CSRF protection and changes authentication behavior, so it was not done without explicit approval.

Viewer question content uses role- and page-scoped copy, selection, drag, context-menu, and print deterrence plus a visible identity/time watermark. These controls are deterrence only: operating-system capture, cameras, extensions, developer tools, accessibility tooling, and screen recording cannot be reliably prevented by a webpage.
