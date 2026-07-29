# Question Bank Backend — Supabase

This project provides the same Express REST API as the MongoDB version, but
stores questions in Supabase Postgres.

## 1. Create the database table

1. Create or open a project at https://supabase.com/dashboard.
2. Open **SQL Editor**.
3. Open `supabase-schema.sql` from this project.
4. Copy the complete SQL, paste it into the SQL Editor, and click **Run**.

## 2. Copy the Supabase credentials

In the Supabase dashboard, open **Project Settings → API**:

- Copy the **Project URL**.
- Copy a server-side **Secret key**. A legacy `service_role` key also works.
- Never put this secret key in frontend/browser code or commit it to Git.

## 3. Configure the backend

In PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env
```

Update `.env`:

```env
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
PORT=4000
ALLOWED_ORIGINS=*
```

## 4. Install and run

```powershell
npm install
npm start
```

Successful output:

```text
Connected to Supabase
Question Bank API running on http://localhost:4000
```

Test http://localhost:4000/health in a browser. It should return:

```json
{"status":"ok","database":"connected"}
```

Open http://localhost:4000 to use the Question Bank Portal. The frontend and
backend are served together, so the browser does not need a separate local
HTML file or development server.

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/questions` | List questions |
| GET | `/api/questions/:id` | Get one question |
| POST | `/api/questions` | Create a question |
| PUT | `/api/questions/:id` | Update a question |
| DELETE | `/api/questions/:id` | Delete a question |

The list endpoint supports `?subject=Physics&qType=mcq_single`.
