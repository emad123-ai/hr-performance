-- =====================================================================
-- Migration 6/6: initial HR work categories (configuration) and
-- demonstration-data loader/cleaner (all demo rows carry is_demo = true)
-- =====================================================================

insert into public.categories (group_name, name, color, sort_order)
select g, n, c, row_number() over ()
from (values
  ('Recruitment', 'Manpower Requisition', '#2563eb'), ('Recruitment', 'Vacancy Management', '#2563eb'),
  ('Recruitment', 'Job Posting', '#2563eb'), ('Recruitment', 'CV Screening', '#2563eb'),
  ('Recruitment', 'Interview Coordination', '#2563eb'), ('Recruitment', 'Candidate Assessment', '#2563eb'),
  ('Recruitment', 'Offer Management', '#2563eb'), ('Recruitment', 'Onboarding', '#2563eb'),
  ('Recruitment', 'Headhunter Management', '#2563eb'), ('Recruitment', 'Recruitment Reporting', '#2563eb'),
  ('HR Operations', 'Employee Documentation', '#0d9488'), ('HR Operations', 'Employee Records', '#0d9488'),
  ('HR Operations', 'Employee Transfers', '#0d9488'), ('HR Operations', 'Resignations', '#0d9488'),
  ('HR Operations', 'Final Settlements', '#0d9488'), ('HR Operations', 'Attendance Coordination', '#0d9488'),
  ('HR Operations', 'Employee Requests', '#0d9488'), ('HR Operations', 'HR Letters', '#0d9488'),
  ('HR Operations', 'Confirmation and Probation', '#0d9488'), ('HR Operations', 'Employee Lifecycle Management', '#0d9488'),
  ('Compliance', 'Contract Expiry', '#d97706'), ('Compliance', 'CNIC Expiry', '#d97706'),
  ('Compliance', 'Documentation Expiry', '#d97706'), ('Compliance', 'Regulatory Compliance', '#d97706'),
  ('Compliance', 'Audit Requirements', '#d97706'), ('Compliance', 'Policy Updates', '#d97706'),
  ('Projects & Initiatives', 'HR Digital Transformation', '#7c3aed'), ('Projects & Initiatives', 'HRIS Implementation', '#7c3aed'),
  ('Projects & Initiatives', 'Career Fairs', '#7c3aed'), ('Projects & Initiatives', 'University Engagement', '#7c3aed'),
  ('Projects & Initiatives', 'Management Projects', '#7c3aed'), ('Projects & Initiatives', 'Process Improvements', '#7c3aed')
) v(g, n, c)
on conflict (group_name, name) do nothing;

-- ---------------------------------------------------------------------
-- seed_demo_data(): expects these auth users to exist (created by
-- scripts/seed-demo.mjs through the Admin API):
--   hr.manager@demo.local, team.lead@demo.local, employee1..5@demo.local
-- Dates are relative to "today" so dashboards always show live-looking data.
-- ---------------------------------------------------------------------
create or replace function public.seed_demo_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := public.app_today();
  v_tz text := coalesce(public.setting('company') ->> 'timezone', 'UTC');
  v_admin uuid; v_lead uuid; e uuid[];
  d_rec uuid; d_ops uuid; d_cmp uuid; d_prj uuid; v_team uuid;
  p uuid[]; v_task uuid; v_tasks uuid[] := '{}'; r record; i int;
  v_dept uuid; v_by uuid; v_done timestamptz; v_plan uuid;
begin
  select id into v_admin from public.profiles where email = 'hr.manager@demo.local';
  select id into v_lead from public.profiles where email = 'team.lead@demo.local';
  select array_agg(id order by email) into e from public.profiles where email like 'employee_@demo.local';
  if v_admin is null or v_lead is null or coalesce(cardinality(e), 0) < 5 then
    raise exception 'Demo users not found. Run scripts/seed-demo.mjs which creates them first.';
  end if;
  if exists (select 1 from public.tasks where is_demo) then
    raise exception 'Demo data already loaded. Run clear_demo_data() first.';
  end if;

  insert into public.departments (name, code, description, is_demo) values
    ('Recruitment & Talent', 'REC', 'Hiring, onboarding and employer branding', true) returning id into d_rec;
  insert into public.departments (name, code, description, is_demo) values
    ('HR Operations', 'OPS', 'Employee lifecycle, records and requests', true) returning id into d_ops;
  insert into public.departments (name, code, description, is_demo) values
    ('Compliance', 'CMP', 'Statutory compliance, audits and policy', true) returning id into d_cmp;
  insert into public.departments (name, code, description, is_demo) values
    ('HR Projects & Initiatives', 'HRP', 'Transformation programmes and initiatives', true) returning id into d_prj;

  insert into public.teams (name, description, department_id, lead_id, is_demo)
  values ('HR Delivery Team', 'Core HR delivery team', d_ops, v_lead, true) returning id into v_team;

  update public.profiles set full_name = 'Imran Qureshi', designation = 'HR Manager', department_id = d_ops,
         joining_date = v_today - 1500, is_demo = true, employee_code = 'DEMO-001' where id = v_admin;
  update public.profiles set full_name = 'Fatima Raza', designation = 'Team Lead', department_id = d_ops, team_id = v_team,
         manager_id = v_admin, joining_date = v_today - 1100, is_demo = true, employee_code = 'DEMO-002' where id = v_lead;
  update public.profiles p2 set full_name = x.n, designation = x.des, department_id = x.dep, team_id = v_team,
         manager_id = v_lead, joining_date = v_today - x.j, is_demo = true, employee_code = x.code
    from (values (e[1], 'Ayesha Khan', 'Recruitment Specialist', d_rec, 700, 'DEMO-003'),
                 (e[2], 'Bilal Ahmed', 'HR Officer', d_ops, 540, 'DEMO-004'),
                 (e[3], 'Sana Malik', 'Compliance Officer', d_cmp, 900, 'DEMO-005'),
                 (e[4], 'Usman Tariq', 'HR Executive', d_rec, 210, 'DEMO-006'),
                 (e[5], 'Hira Siddiqui', 'HR Generalist', d_ops, 400, 'DEMO-007')) x(id, n, des, dep, j, code)
   where p2.id = x.id;
  update public.departments set head_id = v_lead where id in (d_ops, d_rec);
  update public.departments set head_id = v_admin where id in (d_cmp, d_prj);

  -- Projects
  p := array[]::uuid[];
  insert into public.projects (name, description, owner_id, department_id, start_date, target_date, status, priority, created_by, remarks, is_demo)
  values ('HRIS Implementation', 'Select and roll out a cloud HRIS covering core HR, leave and recruitment.', v_admin, d_prj,
          v_today - 35, v_today + 45, 'active', 'critical', v_admin, 'Vendor shortlisted; data migration in progress.', true)
  returning id into v_task; p := p || v_task;
  insert into public.projects (name, description, owner_id, department_id, start_date, target_date, status, priority, created_by, is_demo)
  values ('Campus Career Fair 2026', 'Participate in 10 university career fairs to build the graduate pipeline.', v_lead, d_rec,
          v_today - 15, v_today + 20, 'active', 'high', v_lead, true)
  returning id into v_task; p := p || v_task;
  insert into public.projects (name, description, owner_id, department_id, start_date, target_date, status, priority, created_by, is_demo)
  values ('Employee Records Digitization', 'Scan and index all legacy personnel files.', v_lead, d_ops,
          v_today - 25, v_today + 12, 'active', 'medium', v_lead, true)
  returning id into v_task; p := p || v_task;

  insert into public.project_members (project_id, user_id, member_role) values
    (p[1], v_admin, 'Sponsor'), (p[1], e[2], 'Data lead'), (p[1], e[5], 'Process lead'),
    (p[2], v_lead, 'Owner'), (p[2], e[1], 'Campus relations'), (p[2], e[4], 'Logistics'),
    (p[3], v_lead, 'Owner'), (p[3], e[2], 'Records'), (p[3], e[5], 'Records');

  insert into public.project_milestones (project_id, title, due_date, status, completed_at) values
    (p[1], 'Vendor selected', v_today - 14, 'completed', now() - interval '15 days'),
    (p[1], 'Data migration complete', v_today + 10, 'pending', null),
    (p[1], 'Go-live', v_today + 45, 'pending', null),
    (p[2], 'Universities confirmed', v_today - 4, 'completed', now() - interval '4 days'),
    (p[2], 'Branding material ready', v_today + 7, 'pending', null),
    (p[3], 'Batch 1 digitized', v_today - 8, 'completed', now() - interval '9 days'),
    (p[3], 'Batch 2 digitized', v_today - 1, 'pending', null);

  -- Tasks: (title, category, dept, project#, assignees, priority, complexity, est, start, due, status, pct, done_offset, quality, cause, extra)
  for r in select * from (values
    ( 1, 'Prepare Q4 manpower requisition summary', 'Manpower Requisition', 'REC', 0, '{1}'::int[], 'high', 2, 6, -20, -12, 'completed', 100, -13, 4, 'none', null),
    ( 2, 'Post Finance Analyst vacancy on job portals', 'Job Posting', 'REC', 0, '{4}', 'medium', 1, 3, -18, -15, 'completed', 100, -14, 3, 'none', null),
    ( 3, 'Screen CVs for Software Engineer role (120 applicants)', 'CV Screening', 'REC', 0, '{1}', 'high', 3, 16, -15, -6, 'completed', 100, -7, 5, 'none', null),
    ( 4, 'Coordinate panel interviews – Sales Manager', 'Interview Coordination', 'REC', 0, '{4}', 'high', 2, 8, -10, -3, 'completed', 100, -1, 3, 'none', null),
    ( 5, 'Issue offer letters – October batch', 'Offer Management', 'REC', 0, '{1}', 'critical', 2, 5, -8, -2, 'completed', 100, -2, 4, 'none', null),
    ( 6, 'Onboarding plan for 6 new joiners', 'Onboarding', 'REC', 0, '{4,1}', 'medium', 2, 10, -5, 4, 'in_progress', 60, null, null, 'none', null),
    ( 7, 'Renew headhunter agreements', 'Headhunter Management', 'REC', 0, '{4}', 'low', 1, 3, -6, -1, 'not_started', 0, null, null, 'none', null),
    ( 8, 'Weekly recruitment dashboard', 'Recruitment Reporting', 'REC', 0, '{1}', 'medium', 1, 2, -2, 2, 'in_progress', 30, null, null, 'none', 'weekly'),
    ( 9, 'Update personal files – Finance department', 'Employee Documentation', 'OPS', 3, '{2}', 'medium', 2, 12, -14, -4, 'completed', 100, -5, 4, 'none', null),
    (10, 'Process inter-department transfers (3 cases)', 'Employee Transfers', 'OPS', 0, '{5}', 'high', 2, 6, -9, -2, 'under_review', 100, -2, null, 'none', null),
    (11, 'Exit interviews for October resignations', 'Resignations', 'OPS', 0, '{5}', 'medium', 1, 4, -12, -5, 'completed', 100, -3, 4, 'external', null),
    (12, 'Final settlement calculations – 2 leavers', 'Final Settlements', 'OPS', 0, '{2}', 'critical', 3, 8, -7, -1, 'blocked', 50, null, null, 'external', 'Awaiting payroll data from Finance'),
    (13, 'Monthly attendance reconciliation', 'Attendance Coordination', 'OPS', 0, '{2}', 'high', 2, 6, -3, 0, 'in_progress', 70, null, null, 'none', null),
    (14, 'Experience & salary certificate requests', 'HR Letters', 'OPS', 0, '{5}', 'medium', 1, 3, -2, 1, 'in_progress', 40, null, null, 'none', null),
    (15, 'Probation confirmation reviews – 4 employees', 'Confirmation and Probation', 'OPS', 0, '{5}', 'high', 2, 8, -6, 3, 'not_started', 0, null, null, 'none', null),
    (16, 'Digitize legacy employee records – batch 1', 'Employee Records', 'OPS', 3, '{2,5}', 'high', 3, 20, -20, -8, 'completed', 100, -9, 5, 'none', null),
    (17, 'Digitize legacy employee records – batch 2', 'Employee Records', 'OPS', 3, '{2}', 'high', 3, 20, -7, 6, 'in_progress', 35, null, null, 'none', null),
    (18, 'Contract expiry tracker – Q1 renewals', 'Contract Expiry', 'CMP', 0, '{3}', 'high', 2, 6, -16, -9, 'completed', 100, -10, 5, 'none', null),
    (19, 'CNIC expiry follow-up (14 employees)', 'CNIC Expiry', 'CMP', 0, '{3}', 'medium', 1, 4, -8, -3, 'completed', 100, -2, 3, 'none', null),
    (20, 'Prepare documents for internal HR audit', 'Audit Requirements', 'CMP', 0, '{3}', 'critical', 3, 14, -10, -1, 'in_progress', 80, null, null, 'none', null),
    (21, 'Update leave policy per labour law amendment', 'Policy Updates', 'CMP', 0, '{3}', 'medium', 2, 8, -4, 8, 'in_progress', 20, null, null, 'none', null),
    (22, 'EOBI & social security compliance filing', 'Regulatory Compliance', 'CMP', 0, '{3}', 'high', 2, 5, -25, -18, 'completed', 100, -18, 4, 'none', null),
    (23, 'Set up documentation expiry alerts', 'Documentation Expiry', 'CMP', 0, '{3}', 'low', 1, 3, 0, 12, 'not_started', 0, null, null, 'none', null),
    (24, 'HRIS vendor demo evaluation', 'HRIS Implementation', 'HRP', 1, '{5,2}', 'high', 2, 8, -21, -14, 'completed', 100, -15, 4, 'none', null),
    (25, 'HRIS data migration mapping', 'HRIS Implementation', 'HRP', 1, '{2}', 'critical', 3, 24, -10, 5, 'in_progress', 45, null, null, 'none', null),
    (26, 'HRIS user acceptance test plan', 'HRIS Implementation', 'HRP', 1, '{5}', 'high', 2, 10, -1, 15, 'not_started', 0, null, null, 'none', null),
    (27, 'Career fair stall booking & logistics', 'Career Fairs', 'REC', 2, '{4}', 'high', 2, 6, -12, -6, 'completed', 100, -6, 4, 'none', null),
    (28, 'Shortlist 10 universities for engagement', 'University Engagement', 'REC', 2, '{1}', 'medium', 1, 5, -9, -4, 'completed', 100, -4, 5, 'none', null),
    (29, 'Career fair branding material', 'Career Fairs', 'REC', 2, '{4}', 'medium', 2, 8, -4, 7, 'in_progress', 50, null, null, 'none', null),
    (30, 'Management dashboard on HR KPIs', 'Management Projects', 'HRP', 0, '{1,3}', 'medium', 2, 12, -3, 10, 'not_started', 0, null, null, 'none', null),
    (31, 'Recruitment process improvement proposal', 'Process Improvements', 'REC', 0, '{4}', 'low', 2, 6, -15, -10, 'cancelled', 20, null, null, 'none', 'Merged into the HRIS project scope'),
    (32, 'HR digital transformation roadmap', 'HR Digital Transformation', 'HRP', 1, '{5}', 'high', 3, 16, -30, -20, 'completed', 100, -19, 4, 'none', null),
    (33, 'Compile interview feedback – Sales Manager', 'Candidate Assessment', 'REC', 0, '{1}', 'medium', 1, 3, -4, 2, 'under_review', 100, -1, null, 'none', null),
    (34, 'Vacancy register update', 'Vacancy Management', 'REC', 0, '{4}', 'medium', 1, 2, -40, -35, 'completed', 100, -36, 4, 'none', null),
    (35, 'Q3 attrition analysis', 'Employee Lifecycle Management', 'OPS', 0, '{5}', 'high', 2, 10, -45, -33, 'completed', 100, -34, 3, 'none', null),
    (36, 'Policy acknowledgement drive', 'Policy Updates', 'CMP', 0, '{3}', 'medium', 1, 4, -50, -38, 'completed', 100, -40, 5, 'none', null),
    (37, 'Interview scheduling – Q3 roles', 'Interview Coordination', 'REC', 0, '{1}', 'medium', 1, 4, -55, -42, 'completed', 100, -43, 4, 'none', null),
    (38, 'Employee requests backlog clean-up', 'Employee Requests', 'OPS', 0, '{2}', 'medium', 2, 6, -48, -40, 'completed', 100, -38, 3, 'none', null),
    (39, 'Prepare welcome kits and system access', 'Onboarding', 'REC', 0, '{4}', 'low', 1, 3, -3, 3, 'completed', 100, -1, 4, 'none', 'SUBTASK_OF_6'),
    (40, 'Payroll–HR data reconciliation for HRIS cut-over', 'HRIS Implementation', 'HRP', 1, '{2}', 'critical', 3, 30, -2, 6, 'in_progress', 10, null, null, 'none', null)
  ) as t(n, title, cat, dept, proj, who, prio, cx, est, s_off, d_off, st, pct, done_off, q, cause, extra)
  order by n
  loop
    v_dept := case r.dept when 'REC' then d_rec when 'OPS' then d_ops when 'CMP' then d_cmp else d_prj end;
    v_by := case when r.n % 3 = 0 then v_admin else v_lead end;
    v_done := case when r.done_off is not null then ((v_today + r.done_off)::timestamp + time '15:00') at time zone v_tz end;
    insert into public.tasks (title, description, department_id, project_id, category_id, parent_task_id, assigned_by, assigned_at,
        start_date, due_date, priority, complexity, estimated_hours, actual_hours, status, completion_percentage,
        submitted_at, completed_at, approved_by, quality_rating, delay_cause, blocker_reason, cancelled_reason,
        recurrence, supervisor_feedback, is_demo)
    values (r.title, 'Demonstration task – ' || r.title || '.', v_dept,
        case when r.proj > 0 then p[r.proj] end,
        (select id from public.categories where name = r.cat limit 1),
        case when r.extra = 'SUBTASK_OF_6' then v_tasks[6] end,
        v_by, ((v_today + r.s_off)::timestamp + time '09:30') at time zone v_tz,
        v_today + r.s_off, v_today + r.d_off, r.prio::public.task_priority, r.cx, r.est,
        case when r.st = 'completed' then r.est * (0.8 + (r.n % 5) * 0.1) else round(r.est * r.pct / 100.0, 1) end,
        r.st::public.task_status, r.pct,
        case when r.st in ('completed', 'under_review') then v_done end,
        case when r.st = 'completed' then v_done end,
        case when r.st = 'completed' then v_by end,
        r.q, r.cause::public.delay_cause,
        case when r.st = 'blocked' then r.extra end,
        case when r.st = 'cancelled' then r.extra end,
        case when r.extra in ('weekly') then r.extra::public.recurrence_rule else 'none' end,
        case when r.st = 'completed' and r.q >= 4 then 'Well done – thorough and accurate.'
             when r.st = 'completed' then 'Acceptable; please double-check details next time.' end,
        true)
    returning id into v_task;
    v_tasks := v_tasks || v_task;

    insert into public.task_assignees (task_id, user_id, assigned_by)
    select v_task, e[w], v_by from unnest(r.who) w;

    insert into public.task_activity_logs (task_id, actor_id, action, new_value, created_at)
    values (v_task, v_by, 'created', r.title, ((v_today + r.s_off)::timestamp + time '09:30') at time zone v_tz);
    if r.st = 'completed' then
      insert into public.task_activity_logs (task_id, actor_id, action, field, old_value, new_value, created_at)
      values (v_task, v_by, 'approved', 'quality_rating', null, r.q::text, v_done);
    elsif r.st = 'cancelled' then
      insert into public.task_activity_logs (task_id, actor_id, action, field, old_value, new_value, reason)
      values (v_task, v_by, 'cancelled', 'status', 'in_progress', 'cancelled', r.extra);
    end if;
  end loop;

  -- Historical work in the previous calendar month (gives last month's reviews enough data)
  for i in 1..5 loop
    for k in 1..4 loop
      v_by := v_lead;
      v_dept := case when i in (1, 4) then d_rec when i = 3 then d_cmp else d_ops end;
      insert into public.tasks (title, description, department_id, category_id, assigned_by, assigned_at, start_date, due_date,
          priority, complexity, estimated_hours, actual_hours, status, completion_percentage, submitted_at, completed_at,
          approved_by, quality_rating, supervisor_feedback, is_demo)
      select x.title, 'Demonstration task (previous month).', v_dept, (select id from public.categories where name = x.cat limit 1),
             v_by, ((x.due - 6)::timestamp + time '09:00') at time zone v_tz, x.due - 6, x.due,
             (array['high','medium','medium','low'])[k]::public.task_priority, 1 + (i + k) % 3, 4 + k * 2, 4 + k * 2,
             'completed', 100, x.done, x.done, v_by, 3 + ((i * k) % 3), 'Reviewed and approved.', true
        from (select (array['Weekly hiring status report','Candidate pipeline review','Reference checks batch','Joining formalities'])[k]
                       || ' – week ' || k as title,
                     (case i when 1 then array['Recruitment Reporting','Candidate Assessment','Candidate Assessment','Onboarding']
                             when 4 then array['Job Posting','Interview Coordination','Offer Management','Onboarding']
                             when 3 then array['Contract Expiry','CNIC Expiry','Regulatory Compliance','Audit Requirements']
                             else array['Employee Documentation','HR Letters','Employee Requests','Attendance Coordination'] end)[k] as cat,
                     (date_trunc('month', v_today) - interval '1 month')::date + (k * 6 + i) as due,
                     (((date_trunc('month', v_today) - interval '1 month')::date + (k * 6 + i)
                        + case when (i + k) % 5 = 0 then 2 else -1 end)::timestamp + time '16:00') at time zone v_tz as done) x
      returning id into v_task;
      insert into public.task_assignees (task_id, user_id, assigned_by) values (v_task, e[i], v_by);
      insert into public.task_activity_logs (task_id, actor_id, action, new_value) values (v_task, v_by, 'created', 'Historical demo task');
    end loop;
  end loop;

  -- One approved deadline extension (with reason) and dependencies
  update public.tasks set original_due_date = due_date - 5 where id = v_tasks[17];
  insert into public.task_activity_logs (task_id, actor_id, action, field, old_value, new_value, reason)
  values (v_tasks[17], v_lead, 'deadline_changed', 'due_date', (v_today + 1)::text, (v_today + 6)::text,
          'Additional 400 files discovered in archive [cause: external]');
  insert into public.task_dependencies (task_id, depends_on_id, created_by) values
    (v_tasks[26], v_tasks[25], v_admin), (v_tasks[29], v_tasks[27], v_lead);

  -- Comments
  insert into public.task_comments (task_id, author_id, body, comment_type) values
    (v_tasks[12], e[2], 'Finance has not shared the October payroll extract yet. Followed up twice.', 'blocker'),
    (v_tasks[13], e[2], 'Reconciled 4 of 6 departments; remaining two pending biometric export.', 'progress'),
    (v_tasks[20], e[3], 'Personnel files and contracts compiled; training records still missing.', 'progress'),
    (v_tasks[6], v_lead, 'Please align the plan with the IT access checklist.', 'comment'),
    (v_tasks[10], e[5], 'All three transfer letters issued and acknowledged.', 'submission'),
    (v_tasks[25], e[2], 'Mapped 60% of legacy fields to the HRIS template.', 'progress');

  -- Daily plans (last three days, incl. today) for each employee
  for i in 1..5 loop
    for r in select generate_series(0, 2) as back loop
      insert into public.daily_plans (user_id, plan_date, notes, obstacles, assistance_needed, assistance_details, submitted_at, is_demo)
      values (e[i], v_today - r.back, 'Focus on priority deadlines.',
              case when i = 2 then 'Waiting for payroll extract from Finance' end,
              i = 2, case when i = 2 then 'Need the team lead to escalate the payroll data request' end,
              case when r.back > 0 then now() - make_interval(days => r.back) end, true)
      returning id into v_plan;
      insert into public.daily_plan_items (plan_id, task_id, title, expected_deliverable, estimated_hours, actual_hours, status, sort_order)
      select v_plan, t.id, 'Work on: ' || t.title, 'Progress update on ' || t.task_code, 3,
             case when r.back > 0 then 3 + (k % 2) else null end,
             case when r.back > 0 then (case when k = 3 then 'pending' else 'completed' end)::public.plan_item_status
                  else 'planned'::public.plan_item_status end,
             k
        from (select t2.id, t2.title, t2.task_code, row_number() over (order by t2.due_date) as k
                from public.tasks t2 join public.task_assignees a on a.task_id = t2.id
               where a.user_id = e[i] and t2.is_demo and t2.status not in ('cancelled')
               order by t2.status = 'completed', t2.due_date limit 3) t;
    end loop;
  end loop;

  -- Performance reviews for last month (finalized for three, draft for one)
  insert into public.performance_reviews (employee_id, reviewer_id, period_type, period_start, period_end, weights,
      quality_rating, ownership_rating, communication_rating, strengths, improvements, manager_comments, action_plan, status, is_demo)
  values
    (e[1], v_lead, 'monthly', (date_trunc('month', v_today) - interval '1 month')::date, (date_trunc('month', v_today) - interval '1 day')::date,
     public.setting('kpi_weights'), null, 4, 5, 'Fast, accurate screening; excellent candidate communication.',
     'Delegate routine scheduling to free time for sourcing.', 'Consistently reliable contributor.', 'Shadow HRBP on two workforce plans.', 'finalized', true),
    (e[3], v_lead, 'monthly', (date_trunc('month', v_today) - interval '1 month')::date, (date_trunc('month', v_today) - interval '1 day')::date,
     public.setting('kpi_weights'), null, 5, 4, 'Strong command of statutory requirements.',
     'Share compliance calendar proactively with stakeholders.', 'Very dependable on compliance deliverables.', 'Present monthly compliance digest.', 'finalized', true),
    (e[5], v_lead, 'monthly', (date_trunc('month', v_today) - interval '1 month')::date, (date_trunc('month', v_today) - interval '1 day')::date,
     public.setting('kpi_weights'), 3, 3, 4, 'Good analytical work on attrition.',
     'Improve turnaround on routine letters.', 'Solid month with room to speed up.', 'Weekly check-in on SLA tracking.', 'finalized', true),
    (e[2], v_lead, 'monthly', (date_trunc('month', v_today) - interval '1 month')::date, (date_trunc('month', v_today) - interval '1 day')::date,
     public.setting('kpi_weights'), null, null, null, null, null, null, null, 'draft', true);

  -- Welcome notifications + deadline scan
  insert into public.notifications (user_id, type, title, body, link)
  select id, 'system', 'Welcome to the demo workspace', 'This environment contains demonstration data only.', '/dashboard'
    from public.profiles where is_demo;
  perform public.run_deadline_checks();

  return jsonb_build_object('tasks', cardinality(v_tasks), 'projects', cardinality(p), 'employees', 7);
end $$;
revoke execute on function public.seed_demo_data() from public, anon, authenticated;
grant execute on function public.seed_demo_data() to service_role;

create or replace function public.clear_demo_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_users int; v_tasks int;
begin
  if not exists (select 1 from public.profiles where role = 'admin' and is_active and not is_demo) then
    raise exception 'Create a real administrator account before removing demo data.';
  end if;
  delete from public.tasks where is_demo;
  get diagnostics v_tasks = row_count;
  delete from public.projects where is_demo;
  delete from public.performance_reviews where is_demo;
  delete from public.daily_plans where is_demo;
  update public.profiles set team_id = null where team_id in (select id from public.teams where is_demo);
  delete from public.teams where is_demo;
  update public.profiles set department_id = null where department_id in (select id from public.departments where is_demo);
  update public.departments set head_id = null where head_id in (select id from public.profiles where is_demo);
  delete from public.departments where is_demo;
  select count(*) into v_users from public.profiles where is_demo;
  delete from auth.users where id in (select id from public.profiles where is_demo);
  return jsonb_build_object('tasks_removed', v_tasks, 'users_removed', v_users);
end $$;
revoke execute on function public.clear_demo_data() from public, anon, authenticated;
grant execute on function public.clear_demo_data() to service_role;
