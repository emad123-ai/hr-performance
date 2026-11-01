# Setup & Deployment Guide

This guide assumes basic technical knowledge. Follow the steps in order; each takes a few minutes.

## 0. What you need (all free)

| Tool | Why | Free tier notes |
|---|---|---|
| **Node.js 20.9+** (22 LTS recommended) | Run and build the app | – |
| **GitHub account** | Source code | Free private repos |
| **Supabase account** | Database, login, file storage, realtime | Free: 2 projects, 500 MB database, 1 GB file storage, 50,000 monthly active users, 2 M realtime messages. **Projects pause after 7 days without activity** (data is kept; restore from the dashboard). |
| **Vercel account** (optional) | Hosting | Hobby plan is free but **for personal, non-commercial use only**; cron jobs run at most once per day. See §7 for company use. |

> **Costs:** nothing in this project requires a credit card. Things that *would* cost money: Supabase Pro ($25/month – removes pausing, daily backups, 8 GB DB), Vercel Pro ($20/user/month – commercial use), or a paid e-mail provider. None are required for the application to work.

## 1. Create the Supabase project

1. Go to <https://supabase.com> → **New project**. Choose a strong database password and the region closest to your users.
2. Wait until the project is ready (≈2 minutes).
3. Open **Project Settings → API** (or **API Keys**) and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY` (keep secret – server only!)

## 2. Create the database (one-time)

**Option A – SQL Editor (easiest)**
1. Supabase → **SQL Editor → New query**.
2. Open `supabase/setup.sql` from this project, copy everything, paste, click **Run**.
3. You should see “Success. No rows returned”. This creates all tables, security policies, functions, the private storage bucket, realtime and scheduled jobs.

**Option B – Supabase CLI**
```bash
npx supabase login
npx supabase init            # creates supabase/config.toml (keeps the migrations folder)
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push         # applies supabase/migrations/*.sql in order
```

### Check scheduled jobs (pg_cron)
The setup enables `pg_cron` and schedules three jobs (hourly deadline checks, nightly workload snapshot, monthly metrics). Verify in **Database → Extensions** that *pg_cron* is enabled and in **Integrations → Cron** (or run `select * from cron.job;`). If pg_cron was not available, enable it in Database → Extensions and re-run the last block of `20261101000500_storage_realtime_cron.sql`. Without pg_cron the app still runs deadline checks when managers open the dashboard, and the optional Vercel cron runs once a day.

## 3. Configure authentication (important for security)

Supabase → **Authentication → Sign In / Providers**:
1. **Email** provider: enabled.
2. **Allow new users to sign up: OFF** – accounts are created only by administrators inside the app.
3. **Confirm email**: may stay on; admin-created accounts are pre-confirmed.

Supabase → **Authentication → URL Configuration**:
- **Site URL**: your app URL (e.g. `http://localhost:3000` during development, later your production URL).
- **Redirect URLs**: add `http://localhost:3000/auth/confirm` and `https://YOUR-DOMAIN/auth/confirm`.

Password-reset e-mails use Supabase's built-in mailer, which is free but limited to a few messages per hour. For more, add free custom SMTP in **Authentication → Emails → SMTP Settings** (e.g. a Gmail/Google Workspace or Brevo free SMTP account).

## 4. Configure the app locally

```bash
git clone <your repo> hr-performance && cd hr-performance
cp .env.example .env.local
# edit .env.local with the values from step 1
npm install
```

Create your first real administrator:
```bash
npm run create-admin -- hr.manager@yourcompany.com "Your Name" "ChangeMe12345"
```
*(Alternative without the script: Supabase → Authentication → Users → Add user, then run in the SQL editor: `select public.promote_to_admin('hr.manager@yourcompany.com');`)*

Optional – load demonstration data (7 demo users, departments, 3 projects, ~60 tasks, daily plans, reviews, notifications):
```bash
npm run seed:demo
# demo password defaults to Demo#2026pass (override with DEMO_PASSWORD=...)
```

Start the app:
```bash
npm run dev     # open http://localhost:3000
```

Verify the code before deploying:
```bash
npm run typecheck
npm test
npm run build
```

## 5. Push to GitHub

```bash
git init && git add . && git commit -m "Initial import"
git branch -M main
git remote add origin https://github.com/<you>/hr-performance.git
git push -u origin main
```
`.env.local` is git-ignored – never commit keys.

## 6. Deploy to Vercel

1. <https://vercel.com> → **Add New → Project** → import the GitHub repository. Framework: Next.js (auto-detected).
2. **Environment Variables** (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (your Vercel URL), `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (any long random string).
3. **Deploy**. Then update Supabase **Site URL / Redirect URLs** with the production domain (step 3).
4. `vercel.json` registers a once-daily call to `/api/cron/daily` (deadline checks + workload snapshot) – allowed on Hobby.

## 7. Using it for a company (free options)

Vercel Hobby forbids commercial use. Genuinely free alternatives:
- **Self-host** on any internal server or VM: `npm ci && npm run build && npm start` (port 3000), behind your existing reverse proxy. Use the system scheduler to `curl -H "Authorization: Bearer $CRON_SECRET" https://host/api/cron/daily` daily if pg_cron is unavailable.
- **Docker**: any Node 22 image running the same commands.
- Other hosts with free tiers that permit commercial use – check their current terms before relying on them.

Supabase Free pauses after 7 idle days. Regular weekday use prevents this; for guaranteed uptime upgrade to Pro.

## 8. Updating the database later
Add a new numbered file in `supabase/migrations/` and apply it (SQL editor or `supabase db push`). Never edit migrations that already ran in production.

## 9. Optional e-mail notifications
In-app notifications work with no e-mail service. To also e-mail people, configure custom SMTP (free providers exist) and add a Supabase Edge Function or database webhook on `public.notifications` inserts. This is intentionally not enabled by default so the basic system has no external dependency.

## Environment variables reference

| Variable | Where used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) | browser + server, protected by RLS | no |
| `NEXT_PUBLIC_SITE_URL` | password-reset links | no |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | server actions for account management, seed scripts, cron route | **yes** |
| `CRON_SECRET` | protects `/api/cron/daily` | **yes** |
