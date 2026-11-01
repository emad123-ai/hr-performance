# Troubleshooting

| Symptom | Cause / fix |
|---|---|
| “Supabase is not configured” | `.env.local` (or Vercel env vars) missing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Restart `npm run dev` after editing. |
| Sign-in works but every page redirects to login | Site URL / cookies: make sure you open the app on the same host as `NEXT_PUBLIC_SITE_URL`; clear cookies. |
| “Your account is inactive” | An admin deactivated the account (Employees → Reactivate). |
| User can sign in but sees nothing / “permission” errors | The auth user has no active profile, or the profile is inactive. Check `select * from profiles where email = '...'`. For the very first admin run `select public.promote_to_admin('email');` in the SQL editor. |
| “Only administrators can create employee accounts” although you are admin | `SUPABASE_SERVICE_ROLE_KEY` not set on the server (Vercel env var) – required for the Auth Admin API. |
| “That e-mail address is already registered” | A Supabase Auth user exists already (maybe a deleted employee). Remove it under Authentication → Users or reuse it. |
| Team lead cannot assign a task to someone | The person is not in a team the lead leads and does not report to the lead. Fix team/manager in Employees. |
| “Status, deadline, completion and approval fields can only be changed through the task workflow” | Expected: use the task buttons (progress, submit, approve, change deadline) – direct edits are blocked to protect history. |
| “This task depends on N unfinished task(s)” | Finish or remove the dependency first (task page → Dependencies). |
| Overdue/reminder notifications not arriving | Check pg_cron jobs: `select * from cron.job;` and `select * from cron.job_run_details order by start_time desc limit 10;`. Run manually: Settings → Data & maintenance. |
| Notification bell doesn't update live | Realtime: Database → Publications → `supabase_realtime` must include `notifications`. Run `alter publication supabase_realtime add table public.notifications;`. The count still refreshes on navigation. |
| File upload fails | Max 10 MB and allowed types only (PDF, Office, images, CSV, TXT, ZIP). Check the `task-attachments` bucket exists (Storage). Free tier total storage is 1 GB. |
| Password-reset e-mail not received | Supabase's built-in mailer is rate-limited (a few per hour). Configure custom SMTP, or an admin can set a temporary password (Employees → profile → Reset password). |
| Project is “paused” | Supabase Free pauses after 7 days of inactivity. Restore it from the Supabase dashboard; data is kept. |
| Vercel deploy fails on cron | Hobby allows only daily schedules – keep `vercel.json` as provided. |
| Performance shows “Insufficient data” | Fewer than the minimum number of tasks with a final outcome in the period (Settings → Performance). This is intentional. |
| Scores look different from expectations | See the formulas in ARCHITECTURE.md §5. Cancelled tasks, approved extensions and excused delays are excluded; completion is effort-weighted. |
| `npm run seed:demo` says “Demo data already loaded” | Clear it first: Settings → Data & maintenance, or `select public.clear_demo_data();` (needs a real admin to exist). |
| SQL editor error “relation already exists” | `setup.sql` was run twice. Use a fresh project, or apply only new migrations. |
| Build error about `middleware` | This project uses the Next.js 16 `src/proxy.ts` convention. If you pin Next.js 15, rename it to `src/middleware.ts` and the export to `middleware`. |

## Diagnostics
- Server logs: `npm run dev` terminal / Vercel → Logs.
- Database logs: Supabase → Logs → Postgres.
- Run the DB test-suite locally: install PostgreSQL 16, then `PGHOST=localhost PGUSER=postgres npm run test:db`.
