-- Role-based access & Row Level Security (scenario 11 + security requirements)
\i tests/db/_helpers.sql
begin;

-- An employee outside the demo team (used to test team boundaries)
insert into auth.users (email, raw_user_meta_data) values ('outsider@test.local', '{"full_name":"Out Sider"}');

-- ---------- Employee ----------
select tests.login('employee1@demo.local');

select tests.eq((select count(*) from public.tasks),
  (select count(*) from public.task_assignees where user_id = tests.uid('employee1@demo.local')),
  'employee sees only tasks assigned to them');
select tests.ok((select count(*) from public.tasks) > 0, 'employee sees their own tasks');
select tests.eq((select count(*) from public.task_overview where not (tests.uid('employee1@demo.local') = any(assignee_ids)))::int, 0,
  'task_overview view respects RLS for employees');
select tests.eq((select count(distinct user_id) from public.daily_plans)::int, 1, 'employee sees only their own daily plans');
select tests.eq((select count(*) from public.performance_reviews where status = 'draft')::int, 0, 'employee cannot see draft reviews');
select tests.eq((select count(*) from public.performance_reviews)::int, 1, 'employee sees their own finalized review only');
select tests.eq((select count(*) from public.audit_logs)::int, 0, 'employee cannot read audit logs');
select tests.eq((select count(distinct user_id) from public.notifications)::int, 1, 'employee sees only their own notifications');
select tests.eq((select count(*) from public.workload_overview())::int, 1, 'workload_overview returns only the employee themself');
select tests.eq((select count(*) from public.team_performance('2026-01-01', '2026-12-31'))::int, 1, 'team_performance returns only the employee themself');
select tests.throws($$select * from public.calc_employee_performance(tests.uid('employee2@demo.local'), '2026-01-01', '2026-12-31')$$,
  'employee cannot calculate a colleague''s performance', 'not authorised');

select tests.eq(tests.affected($$update public.tasks set title = 'hacked title' $$), 0, 'employee cannot update tasks directly');
select tests.throws($$insert into public.tasks (title, due_date) values ('Sneaky task', current_date)$$,
  'employee cannot insert tasks directly', 'row-level security');
select tests.throws($$select public.create_task('{"title":"Sneaky task","due_date":"2026-12-01"}', array[tests.uid('employee1@demo.local')])$$,
  'employee cannot create tasks through the RPC', 'only managers');
select tests.throws($$insert into public.task_assignees (task_id, user_id)
                     select id, tests.uid('employee1@demo.local') from public.tasks limit 1$$,
  'employee cannot change task assignments', 'row-level security');
select tests.eq(tests.affected($$update public.profiles set role = 'admin' where id = auth.uid()$$), 0,
  'employee cannot escalate their own role');
select tests.throws($$insert into public.performance_reviews (employee_id, reviewer_id, period_type, period_start, period_end, weights)
                     values (auth.uid(), auth.uid(), 'monthly', '2026-10-01', '2026-10-31', '{}')$$,
  'employee cannot create their own performance review', 'row-level security');
select tests.eq(tests.affected($$update public.performance_reviews set ownership_rating = 5$$), 0,
  'employee cannot modify their performance review');
select tests.eq(tests.affected($$update public.performance_metrics set completion_rate = 100$$), 0,
  'employee cannot modify performance metrics');
select tests.eq(tests.affected($$delete from public.task_activity_logs$$), 0, 'employee cannot delete task history');
select tests.throws($$select public.review_task((select t.id from public.tasks t where t.status = 'under_review' limit 1), 'approve', 5, 'ok')$$,
  'employee cannot approve their own task', 'not authorised');
select tests.throws($$select public.change_task_deadline((select id from public.tasks where status = 'in_progress' limit 1), '2027-01-01', 'want more time')$$,
  'employee cannot change deadlines', 'not authorised');
select tests.throws($$select public.update_task_progress((select t.id from public.tasks t join public.task_assignees a on a.task_id = t.id
                       where a.user_id = tests.uid('employee2@demo.local') and t.status = 'in_progress'
                       and not exists (select 1 from public.task_assignees x where x.task_id = t.id and x.user_id = auth.uid()) limit 1), 50, 'in_progress')$$,
  'employee cannot update a colleague''s task', 'not found');
select tests.eq(tests.affected($$update public.system_settings set value = '{"name":"x"}' where key = 'company'$$), 0,
  'employee cannot change system settings');
select tests.throws($$select public.refresh_performance_metrics('monthly', '2026-10-01', '2026-10-31')$$,
  'employee cannot refresh metrics', 'only administrators');
select tests.throws($$select public.seed_demo_data()$$, 'employee cannot run the demo seeder', 'permission denied');

select public.update_my_profile('0300-1234567');
select tests.eq((select phone from public.profiles where id = auth.uid()), '0300-1234567', 'employee can update their own phone number');

-- Storage: own task folder allowed, foreign task folder denied
select tests.eq(tests.affected(format($$insert into storage.objects (bucket_id, name, owner) values ('task-attachments', '%s/evidence.pdf', auth.uid())$$,
  (select id from public.tasks limit 1))), 1, 'employee can upload files to their own task');
reset role;
select tests.login('employee1@demo.local');
select tests.throws(format($$insert into storage.objects (bucket_id, name, owner) values ('task-attachments', '%s/evil.pdf', auth.uid())$$,
  (select t.id from public.tasks t where not exists (select 1 from public.task_assignees a where a.task_id = t.id
     and a.user_id = tests.uid('employee1@demo.local')) limit 1)),
  'employee cannot upload files to tasks they cannot see', 'row-level security');

-- ---------- Team lead ----------
reset role;
select tests.login('team.lead@demo.local');
select tests.ok((select count(*) from public.tasks) >= 40, 'team lead sees the tasks of their team');
select tests.eq((select count(*) from public.workload_overview())::int, 6, 'team lead sees workload for team members and themself');
select tests.throws($$select public.create_task('{"title":"Outside task","due_date":"2026-12-01"}', array[tests.uid('outsider@test.local')])$$,
  'team lead cannot assign work outside their team', 'own team');
select tests.throws($$update public.tasks set status = 'completed' where status = 'in_progress'$$,
  'protected status field cannot be changed by direct UPDATE', 'task workflow');
select tests.throws($$update public.tasks set due_date = due_date + 10 where status = 'in_progress'$$,
  'deadline cannot be changed without the recorded-reason workflow', 'task workflow');
select tests.ok(tests.affected($$update public.tasks set priority = 'high' where task_code = (select min(task_code) from public.tasks where status = 'not_started')$$) = 1,
  'team lead can edit descriptive fields such as priority');
select tests.eq(tests.affected($$delete from public.task_activity_logs where true$$), 0, 'team leads cannot delete task history');
select tests.throws($$update public.tasks set completion_percentage = 100 where status = 'in_progress'$$,
  'completion percentage cannot be faked by direct UPDATE', 'task workflow');
select tests.eq(tests.affected($$update public.profiles set designation = 'x' where email = 'employee1@demo.local'$$), 0,
  'team lead cannot edit employee master data');
select tests.eq((select count(*) from public.audit_logs)::int, 0, 'team lead cannot read audit logs');
select tests.throws($$insert into public.performance_reviews (employee_id, reviewer_id, period_type, period_start, period_end, weights)
                     values (tests.uid('outsider@test.local'), auth.uid(), 'monthly', '2026-10-01', '2026-10-31', '{}')$$,
  'team lead cannot review employees outside their team', 'not authorised');

-- ---------- Admin ----------
reset role;
select tests.login('hr.manager@demo.local');
select tests.eq((select count(*) from public.tasks), (select count(*) from public.tasks), 'admin query works');
select tests.ok((select count(*) from public.audit_logs) > 0, 'admin can read audit logs');
select tests.ok(tests.affected($$update public.profiles set designation = 'Senior HR Officer' where email = 'employee2@demo.local'$$) = 1,
  'admin can edit employee records');
select tests.throws($$update public.profiles set role = 'employee' where email = 'hr.manager@demo.local'$$,
  'the last active administrator cannot be demoted', 'at least one active administrator');
select tests.throws($$update public.system_settings set value = '{"completion":50,"on_time":25,"quality":20,"ownership":15,"communication":10}' where key = 'kpi_weights'$$,
  'KPI weights must total 100', 'total 100');

-- ---------- Deactivated employee ----------
reset role;
update public.profiles set is_active = false where email = 'employee4@demo.local';
select tests.login('employee4@demo.local');
select tests.eq((select count(*) from public.tasks)::int, 0, 'deactivated user can no longer read tasks');
select tests.eq((select count(*) from public.profiles)::int, 0, 'deactivated user can no longer read the directory');

-- ---------- Anonymous ----------
reset role;
set role anon;
select tests.throws($$select count(*) from public.tasks$$, 'anonymous visitors have no table access', 'permission denied');
select tests.throws($$select public.run_deadline_checks()$$, 'anonymous visitors cannot call RPCs', 'permission denied');
select tests.throws($$select public.setting('company')$$, 'anonymous visitors cannot read settings via RPC', 'permission denied');
reset role;
select tests.login('employee1@demo.local');
select tests.throws($$select public.notify(auth.uid(), 'x', 'spoofed', 'spoofed')$$, 'signed-in users cannot create arbitrary notifications', 'permission denied');
select tests.throws($$insert into public.notifications (user_id, type, title) values (tests.uid('employee2@demo.local'), 'x', 'spoofed')$$,
  'signed-in users cannot insert notifications for others', 'row-level security');

-- ---------- Role escalation through user_metadata is ignored ----------
reset role;
select tests.eq((select role::text from public.profiles where email = 'employee5@demo.local'), 'employee',
  'role in user_metadata is ignored (only app_metadata is trusted)');

rollback;
