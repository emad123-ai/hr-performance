-- Performance engine fairness, review scoring, workload and dashboard KPIs (scenarios 8, 9)
\i tests/db/_helpers.sql
begin;

insert into auth.users (email, raw_user_meta_data) values ('perf@test.local', '{"full_name":"Perf Tester"}');
update public.profiles set team_id = (select id from public.teams limit 1), manager_id = tests.uid('team.lead@demo.local')
 where email = 'perf@test.local';

-- Controlled data in March 2026 (default rules: default 4h, complexity multipliers 1 / 1.5 / 2, scale 1-5)
create temporary table t_ids (k text primary key, id uuid);
with ins as (
  insert into public.tasks (title, start_date, due_date, estimated_hours, complexity, status, completion_percentage,
                            submitted_at, completed_at, quality_rating, delay_cause, original_due_date)
  values
   ('A on time',          '2026-03-01', '2026-03-10', 10, 2, 'completed', 100, '2026-03-09 10:00+05', '2026-03-11 10:00+05', 5, 'none', null),
   ('B late',             '2026-03-01', '2026-03-10',  2, 1, 'completed', 100, '2026-03-12 10:00+05', '2026-03-12 12:00+05', 3, 'none', null),
   ('C missed',           '2026-03-01', '2026-03-15',  4, 2, 'in_progress', 50, null, null, null, 'none', null),
   ('D cancelled',        '2026-03-01', '2026-03-15',  4, 2, 'cancelled', 0, null, null, null, 'none', null),
   ('E external delay',   '2026-03-01', '2026-03-20',  4, 2, 'blocked', 30, null, null, null, 'external', null),
   ('F late but excused', '2026-03-01', '2026-03-20',  4, 2, 'completed', 100, '2026-03-25 10:00+05', '2026-03-25 10:00+05', 4, 'management', null),
   ('G parent',           '2026-03-01', '2026-03-25',  8, 2, 'in_progress', 10, null, null, null, 'none', null),
   ('H extended to April','2026-03-01', '2026-04-05',  4, 2, 'completed', 100, '2026-04-02 10:00+05', '2026-04-02 10:00+05', 4, 'none', '2026-03-28')
  returning id, title)
insert into t_ids select title, id from ins;
insert into public.tasks (title, start_date, due_date, estimated_hours, complexity, parent_task_id, status, completion_percentage, submitted_at, completed_at, quality_rating)
values ('G1 subtask', '2026-03-01', '2026-03-25', 3, 1, (select id from t_ids where k = 'G parent'), 'completed', 100,
        '2026-03-24 10:00+05', '2026-03-24 10:00+05', 4);
insert into public.task_assignees (task_id, user_id)
select id, tests.uid('perf@test.local') from public.tasks where title in
  ('A on time','B late','C missed','D cancelled','E external delay','F late but excused','G parent','H extended to April','G1 subtask');

-- Expected (March):
--   eligible (outcome known): A, B, C(missed), F, G1 = 5 ; excluded: E (external), F counts as completed but excused for on-time
--   weights: A 10*1.5=15, B 2*1=2, C 4*1.5=6, F 4*1.5=6, G1 3*1=3  => completion = (15+2+6+3)/(15+2+6+6+3)= 26/32 = 81.25
--   on-time = on_time(A, G1) / (A, B, C, G1) = 2/4 = 50.00   (F excused, E excluded, D cancelled, G parent ignored)
--   quality = avg(5,3,4,4) = 4.00 -> 80.00
select tests.login('team.lead@demo.local');
select tests.eq((select eligible_tasks from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-03-01', '2026-03-31')), 5,
  'eligible tasks exclude cancelled, external delays, parents and extended tasks');
select tests.eq((select completion_rate from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-03-01', '2026-03-31')), 81.25,
  'completion rate is effort-weighted (estimated hours x complexity)');
select tests.eq((select on_time_rate from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-03-01', '2026-03-31')), 50.00,
  'on-time rate uses submission date and excuses management/external delays');
select tests.eq((select quality_score from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-03-01', '2026-03-31')), 80.00,
  'quality score = average manager task rating on the 1-5 scale');
select tests.eq((select excluded_tasks from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-03-01', '2026-03-31')), 2,
  'excluded (non-penalised) tasks are reported');
select tests.eq((select eligible_tasks from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-04-01', '2026-04-30')), 1,
  'a task with an approved extension is measured in the period of its new deadline');
select tests.eq((select on_time_rate from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-04-01', '2026-04-30')), 100.00,
  'extended task delivered before the approved deadline counts as on time');
select tests.eq(
  (select eligible_tasks from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-03-01', '2026-03-31')) +
  (select eligible_tasks from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-04-01', '2026-04-30')),
  (select eligible_tasks from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-03-01', '2026-04-30')),
  'no task is counted twice across periods');

-- Receiving more tasks does not by itself raise the score: duplicate the identical workload
reset role;
create temporary table before_dup as select * from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-03-01', '2026-03-31');
with src as (select t.* from public.tasks t join public.task_assignees a on a.task_id = t.id
              where a.user_id = tests.uid('perf@test.local') and t.due_date between '2026-03-01' and '2026-03-31'
                and t.title <> 'G parent'),
     ins as (insert into public.tasks (title, start_date, due_date, estimated_hours, complexity, status, completion_percentage,
                                        submitted_at, completed_at, quality_rating, delay_cause)
             select title || ' (copy)', start_date, due_date, estimated_hours, complexity, status, completion_percentage,
                    submitted_at, completed_at, quality_rating, delay_cause from src returning id)
insert into public.task_assignees (task_id, user_id) select id, tests.uid('perf@test.local') from ins;
select tests.eq((select on_time_rate from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-03-01', '2026-03-31')),
  (select on_time_rate from before_dup), 'doubling the task count with identical outcomes leaves on-time rate unchanged');
select tests.ok(abs((select completion_rate from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-03-01', '2026-03-31'))
  - (select completion_rate from before_dup)) < 3, 'doubling the task count with identical outcomes leaves completion rate (almost) unchanged');

-- Weighted review score (scenario 9). March for perf: completion 81.25? recalculated after duplicates -> read live values
select tests.login('team.lead@demo.local');
insert into public.performance_reviews (employee_id, reviewer_id, period_type, period_start, period_end, weights,
   completion_rate, on_time_rate, ownership_rating, communication_rating, manager_comments)
values (tests.uid('perf@test.local'), auth.uid(), 'monthly', '2026-03-01', '2026-03-31', '{}', 100, 100, 4, 3, 'Solid month');
select tests.eq((select completion_rate from public.performance_reviews where employee_id = tests.uid('perf@test.local')),
  (select completion_rate from public.calc_employee_performance(tests.uid('perf@test.local'), '2026-03-01', '2026-03-31')),
  'client-supplied automatic metrics are ignored and recalculated by the database');
select tests.eq((select weights from public.performance_reviews where employee_id = tests.uid('perf@test.local')),
  '{"completion":30,"on_time":25,"quality":20,"ownership":15,"communication":10}'::jsonb, 'configured KPI weights snapshotted on the review');
select tests.eq((select overall_score from public.performance_reviews where employee_id = tests.uid('perf@test.local')),
  (select round((r.completion_rate * 30 + r.on_time_rate * 25 + r.task_quality_score * 20 + 80 * 15 + 60 * 10) / 100.0, 2)
     from public.performance_reviews r where r.employee_id = tests.uid('perf@test.local')),
  'overall score = weighted sum of KPI scores (ratings converted to %)');
select tests.eq((select category from public.performance_reviews where employee_id = tests.uid('perf@test.local')),
  public.performance_category((select overall_score from public.performance_reviews where employee_id = tests.uid('perf@test.local'))),
  'category derived from configured bands');
select tests.ok(not (select is_provisional from public.performance_reviews where employee_id = tests.uid('perf@test.local')),
  'complete review is not provisional');

-- Recalculation when underlying data changes (task rating changes -> review recomputes on save)
reset role;
update public.tasks set quality_rating = 1 where title = 'A on time';
select tests.login('team.lead@demo.local');
update public.performance_reviews set strengths = 'Accurate' where employee_id = tests.uid('perf@test.local');
select tests.ok((select task_quality_score from public.performance_reviews where employee_id = tests.uid('perf@test.local')) < 80,
  'performance score recalculates from current task data');

select tests.throws($$update public.performance_reviews set ownership_rating = 6 where employee_id = tests.uid('perf@test.local')$$,
  'ratings outside the scale are rejected', 'between 1 and');
update public.performance_reviews set status = 'finalized' where employee_id = tests.uid('perf@test.local');
select tests.ok((select finalized_at is not null from public.performance_reviews where employee_id = tests.uid('perf@test.local')), 'review finalized');
select tests.throws($$update public.performance_reviews set ownership_rating = 5 where employee_id = tests.uid('perf@test.local')$$,
  'finalized reviews are locked for team leads', 'administrator');
reset role;
select tests.login('perf@test.local');
select tests.eq((select count(*) from public.performance_reviews)::int, 1, 'employee can view their finalized review');
select tests.ok(exists (select 1 from public.notifications where type = 'review_finalized'), 'employee notified when review is finalized');
reset role;
select tests.login('hr.manager@demo.local');
update public.performance_reviews set status = 'draft' where employee_id = tests.uid('perf@test.local');
select tests.eq((select status::text from public.performance_reviews where employee_id = tests.uid('perf@test.local')), 'draft',
  'administrator can reopen a finalized review');

-- Insufficient data is never labelled as poor performance
insert into public.performance_reviews (employee_id, period_type, period_start, period_end, weights, ownership_rating, communication_rating)
values (tests.uid('perf@test.local'), 'monthly', '2026-04-01', '2026-04-30', '{}', 2, 2);
select tests.eq((select category from public.performance_reviews where employee_id = tests.uid('perf@test.local') and period_start = '2026-04-01'),
  'Insufficient data', 'low task count yields "Insufficient data", not a poor-performance label');
select tests.ok((select is_provisional and cardinality(data_warnings) > 0 from public.performance_reviews
                  where employee_id = tests.uid('perf@test.local') and period_start = '2026-04-01'),
  'incomplete data is flagged with warnings');
select tests.throws($$insert into public.performance_reviews (employee_id, period_type, period_start, period_end, weights, status)
                     values (tests.uid('perf@test.local'), 'monthly', '2026-05-01', '2026-05-31', '{}', 'finalized')$$,
  'cannot finalize without manager ratings', 'required before finalizing');
select tests.throws($$insert into public.performance_reviews (employee_id, period_type, period_start, period_end, weights)
                     values (auth.uid(), 'monthly', '2026-05-01', '2026-05-31', '{}')$$,
  'managers cannot review themselves', 'reviews_not_self');

-- Workload (utilisation = remaining estimated hours / available hours in horizon)
reset role;
update public.tasks set status = 'cancelled' where status not in ('completed', 'cancelled')
   and id in (select task_id from public.task_assignees where user_id = tests.uid('perf@test.local'));
create temporary table wl_ids (id uuid);
with ins as (insert into public.tasks (title, start_date, due_date, estimated_hours, completion_percentage, status, priority)
             values ('W1 report', public.app_today(), public.app_today() + 5, 20, 50, 'in_progress', 'high'),
                    ('W2 report', public.app_today(), public.app_today() + 5, 10, 0, 'not_started', 'medium') returning id)
insert into wl_ids select id from ins;
insert into public.task_assignees (task_id, user_id) select id, tests.uid('perf@test.local') from wl_ids;
-- shared task: 12h split between two people
with ins as (insert into public.tasks (title, start_date, due_date, estimated_hours, status) values ('W3 shared', public.app_today(), public.app_today() + 5, 12, 'not_started') returning id)
insert into public.task_assignees (task_id, user_id) select id, u from ins, unnest(array[tests.uid('perf@test.local'), tests.uid('employee4@demo.local')]) u;
select tests.eq((select remaining_hours from public.workload_overview() where user_id = tests.uid('perf@test.local')), 26.00,
  'remaining hours = estimate x (1 - progress), shared tasks split between assignees');
select tests.eq((select capacity_hours from public.workload_overview() where user_id = tests.uid('perf@test.local')),
  (public.working_days_between(public.app_today(), 10) * 8)::numeric, 'capacity = working days in horizon x hours per day');
update public.profiles set weekly_capacity_hours = 20 where email = 'perf@test.local';
select tests.eq((select capacity_hours from public.workload_overview() where user_id = tests.uid('perf@test.local')),
  (public.working_days_between(public.app_today(), 10) * 4)::numeric, 'part-time capacity override respected');
select tests.eq((select category from public.workload_overview(10) where user_id = tests.uid('perf@test.local')),
  case when 2600.0 / (public.working_days_between(public.app_today(), 10) * 4) < 60 then 'Underutilized'
       when 2600.0 / (public.working_days_between(public.app_today(), 10) * 4) <= 90 then 'Balanced'
       when 2600.0 / (public.working_days_between(public.app_today(), 10) * 4) <= 110 then 'High Workload' else 'Overloaded' end,
  'workload category follows configured thresholds');
select tests.ok(public.record_workload_snapshot() > 0, 'workload snapshot recorded');

-- Dashboard KPIs (scenario 8) are live database calculations
select tests.login('hr.manager@demo.local');
create temporary table d1 as select public.dashboard_summary(date_trunc('month', public.app_today())::date, public.app_today(), 'week') as j;
select tests.eq(((select j from d1) -> 'kpis' ->> 'overdue')::int, (select count(*)::int from public.task_overview where is_overdue),
  'dashboard overdue KPI matches the task records');
select tests.eq(((select j from d1) -> 'kpis' ->> 'total_employees')::int,
  (select count(*)::int from public.profiles where is_active and role <> 'admin'), 'dashboard employee KPI matches records');
select tests.ok(jsonb_array_length((select j from d1) -> 'trend') > 0, 'dashboard returns trend series');
select public.review_task((select id from public.tasks where status = 'under_review' limit 1), 'approve', 4, 'ok');
create temporary table d2 as select public.dashboard_summary(date_trunc('month', public.app_today())::date, public.app_today(), 'week') as j;
select tests.eq(((select j from d2) -> 'kpis' ->> 'completed_in_period')::int, ((select j from d1) -> 'kpis' ->> 'completed_in_period')::int + 1,
  'completed KPI increases immediately after an approval');
reset role;
select tests.login('employee1@demo.local');
select tests.ok(((public.dashboard_summary('2026-01-01', public.app_today(), 'month')) -> 'kpis' ->> 'overdue')::int
  = (select count(*)::int from public.task_overview where is_overdue), 'employee dashboard is limited to their own tasks');

rollback;
