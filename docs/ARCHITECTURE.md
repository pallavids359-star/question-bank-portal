# Architecture

The portal is a CommonJS Node.js 22 application. Express serves a single static HTML application and REST endpoints. Supabase Postgres is accessed exclusively through a server-side service client; database row-level security denies browser roles. Vercel forwards API and health traffic to the exported Express application.

Routes are divided into authentication/session activity, questions/import, users, dashboard, audit/login history, and settings. The browser stores its bearer token in local storage and calls same-origin REST endpoints. Question conversion in `routes/questions.js` maintains compatibility with old schemas by encoding type and difficulty metadata into solution text.

## Permission model

| Operation | Admin | Adder | Editor | Viewer |
|---|---:|---:|---:|---:|
| Read questions | Yes | Yes | Yes | Yes |
| Create/import | Yes | Yes | No | No |
| Update | Yes | Yes | Difficulty only | No |
| Delete | Yes | No | No | No |
| Users/settings/audit/dashboard administration | Yes | No | No | No |

Non-admin users assigned a subject are restricted to it. `All` retains existing unrestricted behavior.
