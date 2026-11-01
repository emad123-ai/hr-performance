# HR Performance Hub

**HR Team Performance & Task Management System** – a production-oriented web application for HR managers and team leads to assign work, track deadlines and delays, monitor workload, run projects, evaluate performance fairly and report to management.

Built entirely on a free stack: **Next.js 16 · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase (PostgreSQL, Auth, Storage, Realtime) · Recharts · React Hook Form · Zod**.

---

## What it does

| Module | Highlights |
|---|---|
| **Executive dashboard** | 12 live KPI cards (each opens the filtered task list), completion & overdue trends, status/priority/department charts, employee comparison, workload distribution, project progress, “requires intervention” list. Date, department, employee and project filters. |
| **Task management** | Auto IDs (`TSK-00001`), table / Kanban (drag & drop) / calendar / My Tasks / Team Tasks views, multi-assignee (shared or one copy each), subtasks, dependencies (cycle-safe), recurring tasks, attachments & evidence, comments, deadline extensions with reason + delay cause, reopen with reason, reassign, escalate, append-only activity history. Overdue is derived automatically. |
| **Daily planner** | Plan activities, link to tasks, deliverables, estimated/actual hours, obstacles, help requests, carry-over; daily summary; team daily-report view for managers. |
| **Performance evaluation** | Configurable weighted KPIs (30/25/20/15/10 default), effort-weighted completion, on-time delivery, quality ratings, manager evaluations, monthly/quarterly/annual reviews, live preview, DB-calculated official score, trends, strengths/improvements/action plan. Fairness rules built in (see below). |
| **Workload** | Utilisation = remaining estimated hours ÷ available hours (working days, part-time capacity, shared tasks split), four categories, imbalance alerts, one-click reassignment, history. |
| **Projects** | Projects, members, milestones (delay alerts), task allocation, effort-weighted progress, Gantt-style timeline, print report. |
| **HR work categories** | Recruitment, HR Operations, Compliance, Projects & Initiatives (32 categories) – fully editable. |
| **Notifications** | In-app, real-time bell (Supabase Realtime), per-type preferences, hourly deadline/overdue/milestone checks (pg_cron). |
| **Reports** | 10 management reports with date-range filters, Excel-compatible CSV export and print layout. |
| **Employees & settings** | Directory with live counters, profiles, account creation/deactivation, password reset; settings for company, departments, teams, roles, categories, priorities, statuses, KPI weights, scale, bands, working time, workload thresholds, reminders, data export, demo-data removal; audit log. |

### Security model
- Three roles (Administrator/HR Manager, Team Lead, Employee) enforced by **PostgreSQL Row Level Security** on every table, plus server-side checks in every action.
- All task state changes go through `SECURITY DEFINER` workflow functions that verify permissions and always write history; a trigger blocks direct edits to status, deadline, completion, approval and rating fields.
- Employees cannot alter scores, assignment history or approved completions; history and audit tables are append-only.
- The service-role key is server-only (account creation, demo seeding); roles are read only from `app_metadata`, never from user-editable metadata.
- Private storage bucket with per-task access policies, 10 MB limit, MIME allow-list.

### Performance fairness rules (implemented in `calc_employee_performance`)
- A task counts in exactly one period – the one containing its *approved* due date (no double counting).
- Completion rate is **effort-weighted** (estimated hours × complexity), so receiving more small tasks doesn't inflate scores.
- Cancelled tasks are excluded; approved extensions move the deadline; delays classified as *external* or *management* are not penalised.
- Delivery date = the employee's submission time (manager review time isn't held against them).
- Tasks not yet due or awaiting review are not judged yet.
- Fewer than *N* (default 3) outcomes ⇒ **“Insufficient data”**, never a poor-performance label; missing inputs produce visible warnings and a provisional flag.
- Automatic metrics and subjective manager ratings are shown separately; the database recalculates the official score on every save.

---

## Quick start (local)

```bash
cp .env.example .env.local        # fill in your Supabase URL + keys
npm install
# create the database: paste supabase/setup.sql into Supabase → SQL Editor → Run
npm run create-admin -- you@company.com "Your Name" "TempPassword123"
npm run seed:demo                  # optional demonstration data
npm run dev                        # http://localhost:3000
```

Full step-by-step instructions: **[docs/SETUP_AND_DEPLOYMENT.md](docs/SETUP_AND_DEPLOYMENT.md)**.

## Documentation

| Document | Contents |
|---|---|
| [docs/SETUP_AND_DEPLOYMENT.md](docs/SETUP_AND_DEPLOYMENT.md) | Supabase setup, environment variables, migrations, local dev, Vercel deployment, free-tier limits & costs |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | First administrator, demo data, employees, teams, configuration, go-live checklist |
| [docs/USER_MANUAL.md](docs/USER_MANUAL.md) | How each role uses the system day to day |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, folder structure, database schema & ERD, permission matrix, formulas |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common problems and fixes |
| [docs/DEVELOPMENT_CHECKLIST.md](docs/DEVELOPMENT_CHECKLIST.md) | Module-by-module status and how each was verified |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development / production build / production server |
| `npm run typecheck` | TypeScript strict check |
| `npm test` | Unit tests for scoring, workload, periods, CSV, permissions, validation (Node test runner) |
| `npm run test:db` | Database test suite (needs a local PostgreSQL – see `tests/db/run.sh`) |
| `npm run create-admin` | Create the first real administrator |
| `npm run seed:demo` | Load demonstration data (7 demo users, ~60 tasks) |

## Testing status
- **Database (148 assertions, 4 suites)** – migrations, RLS for every role, anonymous access, workflow (assign → progress → submit → changes → approve → reopen → extend), overdue detection & alerts, dependencies, recurrence, notifications, performance fairness maths, review scoring/locking, workload, dashboard KPIs, demo data removal. Run against PostgreSQL 16 with Supabase's auth/storage emulated.
- **Unit (25 tests)** – scoring parity with the database, workload, dates/periods, CSV safety, UI permission rules, Zod validation.
- **Next.js build** – run `npm run typecheck && npm run build` after `npm install` (see the checklist for details).

License: private / internal use.
