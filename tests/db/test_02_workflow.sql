-- End-to-end task workflow (scenarios 1-7, 10)
\i tests/db/_helpers.sql
begin;

-- Scenario 1: HR Manager creates an employee account (Admin API inserts into auth.users -> trigger creates profile)
insert into auth.users (email, raw_app_meta_data, raw_user_meta_data)
values ('new.hire@test.local', '{"role":"employee"}', '{"full_name":"New Hire"}');
select tests.ok(exists (select 1 from public.profiles where email = 'new.hire@test.local' and role = 'employee' and is_active),
  'new auth account automatically gets an employee profile');
select tests.ok((select employee_code from public.profiles where email = 'new.hire@test.local') like 'EMP-%',
  'employee code is generated automatically');
update public.profiles set team_id = (select id from public.teams limit 1), manager_id = tests.uid('team.lead@demo.local')
 where email = 'new.hire@test.local';

create temporary table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- Scenario 2: manager assigns a task
select tests.login('team.lead@demo.local');
insert into ctx select 'task', public.create_task(jsonb_build_object(
  'title', 'Prepare onboarding pack', 'description', 'Welcome letter, policies, IT checklist',
  'due_date', public.app_today() + 3, 'priority', 'high', 'complexity', 3, 'estimated_hours', 6),
  array[tests.uid('new.hire@test.local')]);
select tests.ok((select task_code from public.tasks where id = (select v from ctx where k = 'task')) like 'TSK-%', 'task ID generated');
select tests.eq((select status::text from public.tasks where id = (select v from ctx where k = 'task')), 'not_started', 'new task is Not Started');
select tests.ok(exists (select 1 from public.task_activity_logs where task_id = (select v from ctx where k = 'task') and action = 'created'),
  'creation recorded in task history');

-- Scenario 3: employee logs in and sees the task + notification
reset role;
select tests.login('new.hire@test.local');
select tests.eq((select count(*) from public.tasks)::int, 1, 'employee sees the assigned task');
select tests.ok(exists (select 1 from public.notifications where type = 'task_assigned'), 'employee was notified of the assignment');
select tests.eq(public.mark_notifications_read(null), 1, 'employee can mark notifications as read');

-- Scenario 4: progress updates
select public.update_task_progress((select v from ctx where k = 'task'), 40, 'in_progress', 'Drafted welcome letter', 2);
select tests.eq((select completion_percentage::int from public.tasks), 40, 'progress percentage updated');
select tests.eq((select actual_hours from public.tasks), 2.00::numeric, 'actual hours accumulated');
select tests.ok(exists (select 1 from public.task_comments where comment_type = 'progress'), 'progress note stored as a comment');
select tests.ok(exists (select 1 from public.task_activity_logs where field = 'completion_percentage' and new_value = '40'
  and reason = 'Drafted welcome letter'), 'progress change recorded in history with the note');
select tests.throws($$select public.update_task_progress((select v from ctx where k = 'task'), 40, 'blocked', '')$$,
  'blocking a task requires a description', 'describe the blocker');
select public.update_task_progress((select v from ctx where k = 'task'), 50, 'blocked', 'Waiting for IT laptop allocation');
reset role;
select tests.ok(exists (select 1 from public.notifications where user_id = tests.uid('team.lead@demo.local') and type = 'task_blocked'),
  'supervisor notified when a task is blocked');
select tests.login('new.hire@test.local');
select tests.throws($$select public.update_task_progress((select v from ctx where k = 'task'), 100, 'completed')$$,
  'employee cannot mark a task completed directly', 'submit for review');

-- Scenario 5: submit
select public.submit_task((select v from ctx where k = 'task'), 'Pack ready for review', 'Shared drive link in attachments');
select tests.eq((select status::text from public.tasks), 'under_review', 'submitted task is Under Review');
select tests.throws($$select public.update_task_progress((select v from ctx where k = 'task'), 80, 'in_progress')$$,
  'employee cannot edit while under review', 'awaiting review');
reset role;
select tests.ok(exists (select 1 from public.notifications where user_id = tests.uid('team.lead@demo.local') and type = 'task_submitted'),
  'manager notified of submission');

-- Scenario 6: review – request changes, then approve
select tests.login('team.lead@demo.local');
select tests.throws($$select public.review_task((select v from ctx where k = 'task'), 'request_changes', null, '')$$,
  'requesting changes requires feedback', 'feedback is required');
select public.review_task((select v from ctx where k = 'task'), 'request_changes', null, 'Add the leave policy summary');
select tests.eq((select status::text from public.tasks where id = (select v from ctx where k = 'task')), 'in_progress', 'changes requested -> In Progress');
reset role;
select tests.login('new.hire@test.local');
select public.submit_task((select v from ctx where k = 'task'), 'Added leave policy summary');
reset role;
select tests.login('team.lead@demo.local');
select tests.throws($$select public.review_task((select v from ctx where k = 'task'), 'approve', null, 'ok')$$,
  'approval requires a quality rating', 'quality rating');
select tests.throws($$select public.review_task((select v from ctx where k = 'task'), 'approve', 9, 'ok')$$,
  'quality rating must be within the configured scale', 'quality rating');
select public.review_task((select v from ctx where k = 'task'), 'approve', 4, 'Good, complete pack');
select tests.eq((select status::text from public.tasks where id = (select v from ctx where k = 'task')), 'completed', 'approved task is Completed');
select tests.ok((select completed_at is not null and approved_by = auth.uid() from public.tasks where id = (select v from ctx where k = 'task')),
  'completion date and approver recorded');
reset role;
select tests.login('new.hire@test.local');
select tests.ok(exists (select 1 from public.notifications where type = 'task_approved'), 'employee notified of approval');
select tests.throws($$select public.update_task_progress((select v from ctx where k = 'task'), 10, 'in_progress')$$,
  'completed records cannot be altered by the employee', 'reopen');

-- Reopen with reason
reset role;
select tests.login('team.lead@demo.local');
select tests.throws($$select public.reopen_task((select v from ctx where k = 'task'), '')$$, 'reopening requires a reason', 'reason is required');
select public.reopen_task((select v from ctx where k = 'task'), 'Policy version outdated');
select tests.ok((select status = 'in_progress' and completed_at is null and quality_rating is null from public.tasks
                 where id = (select v from ctx where k = 'task')), 'reopened task returns to In Progress');
select tests.ok(exists (select 1 from public.task_activity_logs where task_id = (select v from ctx where k = 'task')
                 and action = 'reopened' and reason = 'Policy version outdated'), 'reopen reason kept in history');
select tests.ok(exists (select 1 from public.task_activity_logs where task_id = (select v from ctx where k = 'task')
                 and action = 'approved'), 'earlier approval is still in the history (not overwritten)');

-- Scenario 10: deadline change with recorded reason
select tests.throws($$select public.change_task_deadline((select v from ctx where k = 'task'), public.app_today() + 10, '')$$,
  'deadline change requires a reason', 'reason is required');
select public.change_task_deadline((select v from ctx where k = 'task'), public.app_today() + 10, 'Policy committee meets next week', 'management');
select tests.eq((select original_due_date from public.tasks where id = (select v from ctx where k = 'task')), public.app_today() + 3,
  'original deadline preserved');
select tests.eq((select due_date from public.tasks where id = (select v from ctx where k = 'task')), public.app_today() + 10, 'new deadline applied');
select tests.ok(exists (select 1 from public.task_activity_logs where task_id = (select v from ctx where k = 'task')
  and action = 'deadline_changed' and reason like 'Policy committee meets next week%'), 'deadline change reason recorded');
reset role;
select tests.ok(exists (select 1 from public.notifications where user_id = tests.uid('new.hire@test.local') and type = 'deadline_changed'),
  'assignee notified of the deadline change');

-- Scenario 7: overdue detection
select tests.login('team.lead@demo.local');
insert into ctx select 'late', public.create_task(jsonb_build_object('title', 'Collect signed contracts',
  'start_date', public.app_today() - 5, 'due_date', public.app_today() - 1), array[tests.uid('new.hire@test.local')]);
select tests.eq((select effective_status from public.task_overview where id = (select v from ctx where k = 'late')), 'overdue',
  'task past its due date is automatically Overdue');
select tests.eq((select days_overdue from public.task_overview where id = (select v from ctx where k = 'late')), 1, 'days overdue calculated');
reset role;
select public.run_deadline_checks();
select tests.eq((select count(*) from public.notifications where task_id = (select v from ctx where k = 'late') and type = 'task_overdue'
                 and user_id = tests.uid('new.hire@test.local'))::int, 1, 'assignee receives one overdue alert');
select public.run_deadline_checks();
select tests.eq((select count(*) from public.notifications where task_id = (select v from ctx where k = 'late') and type = 'task_overdue'
                 and user_id = tests.uid('new.hire@test.local'))::int, 1, 'overdue alert is not duplicated');
select tests.ok(exists (select 1 from public.task_activity_logs where task_id = (select v from ctx where k = 'late') and action = 'became_overdue'),
  'overdue event recorded in history');
select tests.eq((select effective_status from public.task_overview where status = 'cancelled' limit 1), 'cancelled',
  'cancelled tasks are never overdue');

-- Dependencies & subtasks
select tests.login('team.lead@demo.local');
insert into ctx select 'dep', public.create_task(jsonb_build_object('title', 'Send contract pack to payroll',
  'due_date', public.app_today() + 4), array[tests.uid('new.hire@test.local')]);
insert into public.task_dependencies (task_id, depends_on_id) values ((select v from ctx where k = 'dep'), (select v from ctx where k = 'late'));
select tests.throws($$insert into public.task_dependencies (task_id, depends_on_id) values ((select v from ctx where k = 'late'), (select v from ctx where k = 'dep'))$$,
  'circular dependencies are rejected', 'circular');
reset role;
select tests.login('new.hire@test.local');
select tests.throws($$select public.submit_task((select v from ctx where k = 'dep'), 'done')$$,
  'cannot submit while dependencies are unfinished', 'depends on');
reset role;
select tests.login('team.lead@demo.local');
insert into ctx select 'sub', public.create_task(jsonb_build_object('title', 'Scan contracts', 'due_date', public.app_today() + 1,
  'parent_task_id', (select v from ctx where k = 'late')), array[tests.uid('new.hire@test.local')]);
select tests.eq((select subtask_count from public.task_overview where id = (select v from ctx where k = 'late')), 1, 'subtask linked to parent');

-- Cancel & reassign
select tests.throws($$select public.cancel_task((select v from ctx where k = 'dep'), '')$$, 'cancelling requires a reason', 'reason is required');
select public.reassign_task((select v from ctx where k = 'dep'), array[tests.uid('employee2@demo.local')], 'Bilal owns payroll liaison');
select tests.eq((select assignee_ids from public.task_overview where id = (select v from ctx where k = 'dep')),
  array[tests.uid('employee2@demo.local')], 'task reassigned');
select tests.ok(exists (select 1 from public.task_activity_logs where task_id = (select v from ctx where k = 'dep') and action = 'assignee_removed'),
  'reassignment recorded in history');
reset role;
select tests.ok(exists (select 1 from public.notifications where user_id = tests.uid('new.hire@test.local') and type = 'task_reassigned'),
  'previous assignee notified of reassignment');

-- Recurring task: approving generates the next occurrence
select tests.login('team.lead@demo.local');
insert into ctx select 'rec', public.create_task(jsonb_build_object('title', 'Weekly headcount report', 'due_date', public.app_today() + 2,
  'recurrence', 'weekly'), array[tests.uid('new.hire@test.local')]);
select public.review_task((select v from ctx where k = 'rec'), 'approve', 5, 'Thanks');
select tests.ok(exists (select 1 from public.tasks where recurrence_source_id = (select v from ctx where k = 'rec')
                 and due_date = public.app_today() + 9 and status = 'not_started'), 'next weekly occurrence generated');

-- Field edits are logged, never silently overwritten
update public.tasks set title = 'Weekly headcount & attrition report' where id = (select v from ctx where k = 'rec');
select tests.ok(exists (select 1 from public.task_activity_logs where task_id = (select v from ctx where k = 'rec')
  and field = 'title' and old_value = 'Weekly headcount report'), 'title change logged with old value');

-- Escalation
select public.escalate_task((select v from ctx where k = 'late'), 'Employee needs HR manager support with legal team');
reset role;
select tests.ok(exists (select 1 from public.notifications where user_id = tests.uid('hr.manager@demo.local') and type = 'task_escalated'),
  'escalation notifies administrators');

-- Notification preferences are respected
insert into public.notification_preferences (user_id, disabled_types) values (tests.uid('employee3@demo.local'), '{task_assigned}')
  on conflict (user_id) do update set disabled_types = '{task_assigned}';
select tests.login('team.lead@demo.local');
select public.create_task(jsonb_build_object('title', 'Quiet assignment', 'due_date', public.app_today() + 5), array[tests.uid('employee3@demo.local')]);
reset role;
select tests.eq((select count(*) from public.notifications where user_id = tests.uid('employee3@demo.local') and title like '%Quiet assignment%')::int, 0,
  'disabled notification types are not delivered');

rollback;
