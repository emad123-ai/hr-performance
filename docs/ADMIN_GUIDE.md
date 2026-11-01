# Administrator Guide

## 1. First sign-in
1. Create your administrator (`npm run create-admin`, see the setup guide) and sign in.
2. Open **My profile → Security** and change the temporary password.

## 2. Try the demo (optional)
`npm run seed:demo` creates seven accounts (password `Demo#2026pass` unless you set `DEMO_PASSWORD`):

| E-mail | Role | Name |
|---|---|---|
| hr.manager@demo.local | Administrator / HR Manager | Imran Qureshi |
| team.lead@demo.local | Team Lead | Fatima Raza |
| employee1@demo.local … employee5@demo.local | Employees | Ayesha, Bilal, Sana, Usman, Hira |

Demo records carry a yellow **Demo** badge and a banner is shown while any demo data exists. Dates are relative to the day you load it, so dashboards look current. Typical things to try: sign in as the team lead and approve Bilal's transfer task; sign in as Bilal and submit progress; check the Workload page (Bilal is overloaded).

**Before go-live:** Settings → Data & maintenance → type `DELETE DEMO DATA` → Delete. (Requires at least one real, active administrator. Configuration such as categories and settings is kept.)

## 3. Organisation setup (Settings)
Work through the tabs in this order:
1. **Company** – name, time zone (drives “today”, overdue and reminders), fiscal-year start.
2. **Departments & teams** – create departments; create teams and choose a **team lead**. A team lead supervises (a) members of teams they lead and (b) people whose *reporting manager* is them.
3. **Roles & designations** – review role descriptions; maintain the designation list.
4. **Task categories** – edit the HR categories; deactivate instead of deleting categories that are in use.
5. **Priorities & statuses** – labels, colours, target turnaround.
6. **Performance** – KPI weights (must total 100), rating scale (3–10), minimum tasks for a valid score, default estimate, score bands.
7. **Working time & workload** – working days, hours/day, horizon and utilisation thresholds.
8. **Reminders** – days-before-due reminders, overdue and milestone alerts.

## 4. Employees
- **Employees → Add employee**: name, official e-mail, role, department, team, reporting manager, joining date, optional weekly capacity (part-time), temporary password. Share the password securely; the employee changes it under My profile.
- **Edit** to change role/department/manager. **Deactivate** blocks sign-in immediately but keeps every task, comment and review. Reassign their open tasks from **Workload**.
- **Reset password** sets a new temporary password.

## 5. Daily operation
- **Dashboard**: start here each day – the yellow box lists overdue/blocked work and overloaded people; every KPI card opens the matching task list.
- **Team Tasks**: filter by person, project, department, category, status, priority or due window; switch between Table, Board and Calendar.
- **Reviews**: *Performance* shows live scorecards. Click **Start review**, enter ownership and communication ratings (optional quality override), comments and an action plan, then **Finalize**. Finalized reviews are locked (administrators can return them to draft) and the employee is notified.
- **Reports**: choose a report, set the period/department/employee, then **Export CSV** (opens in Excel) or **Print**.

## 6. Scheduled jobs
pg_cron runs deadline checks hourly, a workload snapshot nightly and stores last month's metrics on the 1st. You can run each manually in **Settings → Data & maintenance**.

## 7. Audit & data protection
- **Settings → Audit log** shows who changed employee records, departments, teams, categories, projects, settings and reviews (old → new values).
- Each task keeps its own append-only activity history.
- Exports respect permissions (team leads only export their own people).
- Backups: Supabase Free has no automatic backups – schedule `pg_dump` with your connection string, or upgrade to Pro for daily backups.

## 8. Go-live checklist
- [ ] Real administrator created and demo data deleted
- [ ] Sign-ups disabled in Supabase Auth
- [ ] Site URL / redirect URLs set to the production domain
- [ ] Company, departments, teams, categories, weights, working time configured
- [ ] Employees created with correct managers/teams
- [ ] pg_cron jobs visible (`select * from cron.job`)
- [ ] Backup routine agreed
