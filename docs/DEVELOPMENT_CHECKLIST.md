# Development Checklist

Legend: ✅ implemented and verified by automated tests · 🟢 implemented, verified by type-check/review (UI) · ⏳ requires verification in your environment

## Verification performed in the build environment
| Check | Result |
|---|---|
| All 7 migrations + `setup.sql` apply cleanly on PostgreSQL 16 (Supabase auth/storage emulated) | ✅ |
| Database test-suite – 148 assertions (security 53, workflow 52, analytics 36, demo data 7) | ✅ all pass |
| Unit tests – 25 (scoring parity with SQL, workload, periods, CSV, permissions, validation) | ✅ all pass |
| Project-wide TypeScript check of own code (imports, exports, signatures, props) with third-party modules stubbed | 🟢 no project errors |
| `npm install && npm run typecheck && npm run build` with real packages | ⏳ **not possible in the build sandbox (npm registry blocked)** – run locally before deploying |
| Manual click-through on desktop & mobile | ⏳ do after first deployment (layout is responsive: sidebar collapses to a drawer < 1024 px, tables scroll horizontally) |

## Phase 1 – Planning & architecture
- ✅ Requirements analysis, architecture, schema, roles/permissions, folder structure, design system (navy #1F3952, #F5F7FA background)

## Phase 2 – Project setup
- 🟢 Next.js 16 + TypeScript strict, Tailwind v4, shadcn/ui components, Supabase SSR clients, proxy, env example

## Phase 3 – Core
- ✅ Authentication (Supabase e-mail/password), profile auto-creation, role from app_metadata only
- ✅ RLS on all 22 tables, storage policies, function privileges
- 🟢 Login, password reset, sign out (incl. all devices), protected routes
- ✅ Employee accounts: create (Admin API), edit, deactivate/reactivate (+ Auth ban), reset password · 🟢 UI
- 🟢 Employee directory: search, filters, sorting, pagination, profile, task history, trend
- ✅ Task workflow functions, guards, history, notifications · 🟢 Task UI: table, Kanban DnD, calendar, My/Team views, detail page, dialogs, attachments, comments, dependencies, subtasks, recurrence

## Phase 4 – Management modules
- ✅ Dashboard KPIs from `dashboard_summary` (tested against records) · 🟢 dashboard UI, 8 charts, filters, drill-down links
- 🟢 Daily planner + team daily reports (RLS ✅)
- 🟢 Projects, members, milestones, timeline, delayed milestone alerts (✅ in deadline checks)
- ✅ Workload calculation · 🟢 workload UI + reassignment + history
- ✅ Notifications (triggers, preferences, dedupe) · 🟢 realtime bell, notifications page

## Phase 5 – Analytics
- ✅ Performance engine & fairness rules, review scoring, locking, recalculation
- 🟢 Scorecards, review form with live preview, trends
- 🟢 10 reports + CSV (✅ CSV escaping unit-tested) + print layout

## Phase 6 – Testing & security
- ✅ Scenarios 1–11 covered by the DB suite (account creation → assignment → progress → submission → review → overdue → KPIs → score recalculation → deadline change → unauthorised access)
- ⏳ Scenario 12 (export) – CSV generation unit-tested; download to be clicked through after deploy
- ⏳ Scenario 13 (mobile/desktop) – responsive layout implemented; visual check after deploy

## Phase 7 – Deployment
- 🟢 Vercel config (daily cron), deployment & Supabase guides, admin guide, user manual, troubleshooting

## Known limitations / future enhancements
- E-mail notifications are optional and not wired by default (in-app only) to avoid a paid/mandatory service.
- Supabase Free pauses idle projects after 7 days and has no automatic backups.
- Vercel Hobby is non-commercial; self-hosting is the free route for company use.
- Generated Supabase TypeScript types are not committed; domain types are hand-maintained in `src/lib/types.ts` (`npx supabase gen types` can replace them).
