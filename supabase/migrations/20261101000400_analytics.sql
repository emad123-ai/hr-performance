-- =====================================================================
-- Migration 4/6: reporting views, performance engine, workload, dashboard
-- Views use security_invoker so Row Level Security of the caller applies.
-- =====================================================================

-- ---------- Task overview (overdue derived automatically) ----------
create or replace view public.task_overview with (security_invoker = true) as
select
  t.*,
  (t.status not in ('completed', 'cancelled') and t.due_date < public.app_today()) as is_overdue,
  case when t.status not in ('completed', 'cancelled') and t.due_date < public.app_today()
       then 'overdue' else t.status::text end as effective_status,
  greatest(public.app_today() - t.due_date, 0) as days_overdue,
  coalesce((select array_agg(a.user_id order by p.full_name) from public.task_assignees a
             join public.profiles p on p.id = a.user_id where a.task_id = t.id), '{}') as assignee_ids,
  coalesce((select array_agg(p.full_name order by p.full_name) from public.task_assignees a
             join public.profiles p on p.id = a.user_id where a.task_id = t.id), '{}') as assignee_names,
  (select p.full_name from public.profiles p where p.id = t.assigned_by) as assigned_by_name,
  (select pr.name from public.projects pr where pr.id = t.project_id) as project_name,
  (select d.name from public.departments d where d.id = t.department_id) as department_name,
  (select c.name from public.categories c where c.id = t.category_id) as category_name,
  (select c.group_name from public.categories c where c.id = t.category_id) as category_group,
  (select c.color from public.categories c where c.id = t.category_id) as category_color,
  (select count(*) from public.tasks s where s.parent_task_id = t.id)::int as subtask_count,
  (select count(*) from public.task_dependencies d join public.tasks dt on dt.id = d.depends_on_id
    where d.task_id = t.id and dt.status not in ('completed', 'cancelled'))::int as open_dependency_count,
  (t.status = 'completed' and (coalesce(t.submitted_at, t.completed_at) at time zone
     coalesce((public.setting('company') ->> 'timezone'), 'UTC'))::date <= t.due_date) as completed_on_time
from public.tasks t;

-- ---------- Project overview ----------
create or replace view public.project_overview with (security_invoker = true) as
select
  p.*,
  (select full_name from public.profiles where id = p.owner_id) as owner_name,
  (select name from public.departments where id = p.department_id) as department_name,
  coalesce(s.total_tasks, 0) as total_tasks,
  coalesce(s.completed_tasks, 0) as completed_tasks,
  coalesce(s.overdue_tasks, 0) as overdue_tasks,
  coalesce(s.progress, 0) as progress,
  (select count(*) from public.project_members m where m.project_id = p.id)::int as member_count,
  (select count(*) from public.project_milestones m where m.project_id = p.id)::int as milestone_count,
  (select count(*) from public.project_milestones m where m.project_id = p.id and m.status = 'completed')::int as milestones_completed,
  (select count(*) from public.project_milestones m where m.project_id = p.id and m.status = 'pending'
     and m.due_date < public.app_today())::int as milestones_delayed,
  (p.status not in ('completed', 'cancelled') and p.target_date < public.app_today()) as is_delayed
from public.projects p
left join lateral (
  select count(*)::int as total_tasks,
         count(*) filter (where t.status = 'completed')::int as completed_tasks,
         count(*) filter (where t.status not in ('completed', 'cancelled') and t.due_date < public.app_today())::int as overdue_tasks,
         round(100 * sum(coalesce(t.estimated_hours, 4) * t.completion_percentage / 100.0)
               / nullif(sum(coalesce(t.estimated_hours, 4)), 0), 1) as progress
    from public.tasks t
   where t.project_id = p.id and t.status <> 'cancelled'
     and not exists (select 1 from public.tasks c where c.parent_task_id = t.id)
) s on true;

-- ---------- Scoring helpers (shared by reviews and indicative scorecards) ----------
create or replace function public.performance_category(p_score numeric) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_score is null then null else (
    select b ->> 'label' from jsonb_array_elements(public.setting('performance_bands')) b
     where p_score >= (b ->> 'min')::numeric
     order by (b ->> 'min')::numeric desc limit 1) end
$$;

-- Weighted score over the components that are available; weights are re-normalised and the
-- caller is told how much of the total weight was actually covered.
create or replace function public.weighted_score(p_completion numeric, p_on_time numeric, p_quality numeric,
    p_ownership numeric, p_communication numeric, p_weights jsonb default null,
    out score numeric, out weight_covered numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  w jsonb := coalesce(p_weights, public.setting('kpi_weights'));
  v_sum numeric := 0;
  v_w numeric := 0;
begin
  if p_completion is not null then v_sum := v_sum + p_completion * (w ->> 'completion')::numeric; v_w := v_w + (w ->> 'completion')::numeric; end if;
  if p_on_time is not null then v_sum := v_sum + p_on_time * (w ->> 'on_time')::numeric; v_w := v_w + (w ->> 'on_time')::numeric; end if;
  if p_quality is not null then v_sum := v_sum + p_quality * (w ->> 'quality')::numeric; v_w := v_w + (w ->> 'quality')::numeric; end if;
  if p_ownership is not null then v_sum := v_sum + p_ownership * (w ->> 'ownership')::numeric; v_w := v_w + (w ->> 'ownership')::numeric; end if;
  if p_communication is not null then v_sum := v_sum + p_communication * (w ->> 'communication')::numeric; v_w := v_w + (w ->> 'communication')::numeric; end if;
  score := case when v_w > 0 then round(v_sum / v_w, 2) end;
  weight_covered := v_w;
end $$;

-- ---------- Automatic performance metrics ----------
-- Fairness rules:
--  * A task belongs to exactly one period: the one containing its (approved) due date -> no double counting.
--  * Only leaf tasks count (a parent with subtasks is represented by its subtasks).
--  * Cancelled tasks are excluded. Approved deadline extensions move the due date, so the employee
--    is measured against the approved deadline.
--  * Delays classified as 'external' or 'management' are excluded from the denominators unless the task completed.
--  * Tasks still open and not yet due, or awaiting manager review, are not judged yet.
--  * Completion rate is effort-weighted (estimated hours x complexity multiplier) so receiving more,
--    smaller tasks does not inflate a score; on-time delivery is a ratio and is count-based.
create or replace function public.calc_employee_performance(p_employee uuid, p_from date, p_to date)
returns table (
  eligible_tasks int, completed_tasks int, on_time_tasks int, late_tasks int, missed_tasks int,
  excluded_tasks int, pending_not_due int, awaiting_review int, rated_tasks int,
  completion_rate numeric, on_time_rate numeric, quality_avg numeric, quality_score numeric, effort_hours numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rules jsonb := coalesce(public.setting('performance_rules'), '{}');
  v_default numeric := coalesce((v_rules ->> 'default_estimated_hours')::numeric, 4);
  v_mult jsonb := coalesce(v_rules -> 'complexity_multipliers', '{"1":1,"2":1.5,"3":2}');
  v_scale numeric := coalesce((public.setting('evaluation_scale') ->> 'max')::numeric, 5);
  v_tz text := coalesce(public.setting('company') ->> 'timezone', 'UTC');
  v_today date := public.app_today();
begin
  if auth.uid() is not null and not public.can_view_user_data(p_employee) then
    raise exception 'Not authorised to view this employee''s performance' using errcode = '42501';
  end if;
  return query
  with base as (
    select t.status, t.due_date, t.delay_cause, t.quality_rating,
           coalesce(t.estimated_hours, v_default) * coalesce((v_mult ->> t.complexity::text)::numeric, 1) as w,
           (coalesce(t.submitted_at, t.completed_at) at time zone v_tz)::date as delivered_on
      from public.tasks t
      join public.task_assignees a on a.task_id = t.id and a.user_id = p_employee
     where t.due_date between p_from and p_to
       and t.status <> 'cancelled'
       and not exists (select 1 from public.tasks c where c.parent_task_id = t.id)
  ), c as (
    select b.*,
      case
        when b.status = 'completed' and b.delivered_on <= b.due_date then 'on_time'
        when b.status = 'completed' and b.delay_cause in ('external', 'management') then 'late_excused'
        when b.status = 'completed' then 'late'
        when b.delay_cause in ('external', 'management') then 'excluded'
        when b.status = 'under_review' then 'awaiting_review'
        when b.due_date >= v_today then 'pending'
        else 'missed'
      end as outcome
    from base b
  )
  select
    count(*) filter (where outcome in ('on_time', 'late', 'late_excused', 'missed'))::int,
    count(*) filter (where outcome in ('on_time', 'late', 'late_excused'))::int,
    count(*) filter (where outcome = 'on_time')::int,
    count(*) filter (where outcome = 'late')::int,
    count(*) filter (where outcome = 'missed')::int,
    count(*) filter (where outcome in ('excluded', 'late_excused'))::int,
    count(*) filter (where outcome = 'pending')::int,
    count(*) filter (where outcome = 'awaiting_review')::int,
    count(*) filter (where quality_rating is not null and status = 'completed')::int,
    round(100 * sum(w) filter (where outcome in ('on_time', 'late', 'late_excused'))
          / nullif(sum(w) filter (where outcome in ('on_time', 'late', 'late_excused', 'missed')), 0), 2),
    round(100.0 * count(*) filter (where outcome = 'on_time')
          / nullif(count(*) filter (where outcome in ('on_time', 'late', 'missed')), 0), 2),
    round(avg(quality_rating) filter (where status = 'completed'), 2),
    round(100 * avg(quality_rating) filter (where status = 'completed') / v_scale, 2),
    coalesce(round(sum(w) filter (where outcome in ('on_time', 'late', 'late_excused')), 2), 0)
  from c;
end $$;
revoke execute on function public.calc_employee_performance(uuid, date, date) from public, anon;
grant execute on function public.calc_employee_performance(uuid, date, date) to authenticated, service_role;

-- Team scorecard: one row per employee the caller may see.
create or replace function public.team_performance(p_from date, p_to date, p_department uuid default null)
returns table (
  employee_id uuid, full_name text, employee_code text, designation text, department_id uuid, department_name text,
  eligible_tasks int, completed_tasks int, on_time_tasks int, late_tasks int, missed_tasks int, excluded_tasks int,
  pending_not_due int, awaiting_review int, completion_rate numeric, on_time_rate numeric, quality_score numeric,
  effort_hours numeric, indicative_score numeric, data_sufficient boolean,
  review_id uuid, review_score numeric, review_category text, review_status public.review_status)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_min int := coalesce((public.setting('performance_rules') ->> 'min_tasks_for_evaluation')::int, 3);
begin
  return query
  select p.id, p.full_name, p.employee_code, p.designation, p.department_id, d.name,
         m.eligible_tasks, m.completed_tasks, m.on_time_tasks, m.late_tasks, m.missed_tasks, m.excluded_tasks,
         m.pending_not_due, m.awaiting_review, m.completion_rate, m.on_time_rate, m.quality_score, m.effort_hours,
         (public.weighted_score(m.completion_rate, m.on_time_rate, m.quality_score, null, null)).score,
         m.eligible_tasks >= v_min,
         r.id, r.overall_score, r.category, r.status
    from public.profiles p
    left join public.departments d on d.id = p.department_id
    cross join lateral public.calc_employee_performance(p.id, p_from, p_to) m
    left join lateral (
      select pr.id, pr.overall_score, pr.category, pr.status from public.performance_reviews pr
       where pr.employee_id = p.id and pr.period_start <= p_to and pr.period_end >= p_from
         and (pr.status = 'finalized' or public.manages_user(p.id))
       order by pr.period_end desc limit 1) r on true
   where p.is_active and p.role <> 'admin'
     and (auth.uid() is null or public.can_view_user_data(p.id))
     and (p_department is null or p.department_id = p_department)
   order by p.full_name;
end $$;
revoke execute on function public.team_performance(date, date, uuid) from public, anon;
grant execute on function public.team_performance(date, date, uuid) to authenticated, service_role;

-- Monthly trend for one employee (last N months, including the current month).
create or replace function public.performance_trend(p_employee uuid, p_months int default 6)
returns table (period_start date, period_end date, completion_rate numeric, on_time_rate numeric,
               quality_score numeric, indicative_score numeric, eligible_tasks int, review_score numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month date;
begin
  if auth.uid() is not null and not public.can_view_user_data(p_employee) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  for v_month in
    select generate_series(date_trunc('month', public.app_today()) - make_interval(months => greatest(p_months, 1) - 1),
                           date_trunc('month', public.app_today()), interval '1 month')::date
  loop
    period_start := v_month;
    period_end := (v_month + interval '1 month - 1 day')::date;
    select m.completion_rate, m.on_time_rate, m.quality_score, m.eligible_tasks
      into completion_rate, on_time_rate, quality_score, eligible_tasks
      from public.calc_employee_performance(p_employee, period_start, period_end) m;
    indicative_score := (public.weighted_score(completion_rate, on_time_rate, quality_score, null, null)).score;
    select pr.overall_score into review_score from public.performance_reviews pr
     where pr.employee_id = p_employee and pr.period_type = 'monthly' and pr.period_start = v_month
       and (pr.status = 'finalized' or public.manages_user(p_employee));
    return next;
    review_score := null;
  end loop;
end $$;
revoke execute on function public.performance_trend(uuid, int) from public, anon;
grant execute on function public.performance_trend(uuid, int) to authenticated, service_role;

-- ---------- Performance reviews: system-calculated fields are recomputed by the database ----------
create or replace function public.compute_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m record;
  v_min int := coalesce((public.setting('performance_rules') ->> 'min_tasks_for_evaluation')::int, 3);
  v_quality numeric;
  v_own numeric;
  v_comm numeric;
  v_ws record;
  v_warn text[] := '{}';
begin
  if tg_op = 'UPDATE' and old.status = 'finalized' then
    -- auth.uid() is set for every signed-in API request; NULL for trusted server jobs (cron / service role).
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Finalized reviews can only be changed by an administrator' using errcode = '42501';
    end if;
    if new.status = 'finalized' and auth.uid() is not null then
      raise exception 'Return the review to draft before editing it';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.weights := coalesce(public.setting('kpi_weights'), new.weights);
    new.rating_scale := coalesce((public.setting('evaluation_scale') ->> 'max')::int, 5);
    new.reviewer_id := coalesce(auth.uid(), new.reviewer_id);
  else
    new.weights := old.weights;            -- weights are frozen at creation
    new.rating_scale := old.rating_scale;
    new.employee_id := old.employee_id;
  end if;

  if new.quality_rating is not null and (new.quality_rating < 1 or new.quality_rating > new.rating_scale)
     or new.ownership_rating is not null and (new.ownership_rating < 1 or new.ownership_rating > new.rating_scale)
     or new.communication_rating is not null and (new.communication_rating < 1 or new.communication_rating > new.rating_scale) then
    raise exception 'Ratings must be between 1 and %', new.rating_scale;
  end if;

  -- Recompute automatic metrics (never trust client-supplied values) unless the review is already finalized.
  if new.status = 'draft' or tg_op = 'INSERT' or old.status = 'draft' then
    select * into m from public.calc_employee_performance(new.employee_id, new.period_start, new.period_end);
    new.eligible_tasks := m.eligible_tasks;
    new.completed_tasks := m.completed_tasks;
    new.completion_rate := m.completion_rate;
    new.on_time_rate := m.on_time_rate;
    new.task_quality_score := m.quality_score;
  end if;

  v_quality := coalesce(round(100 * new.quality_rating / new.rating_scale, 2), new.task_quality_score);
  v_own := round(100 * new.ownership_rating / new.rating_scale, 2);
  v_comm := round(100 * new.communication_rating / new.rating_scale, 2);
  select * into v_ws from public.weighted_score(new.completion_rate, new.on_time_rate, v_quality, v_own, v_comm, new.weights);
  new.overall_score := v_ws.score;

  if new.eligible_tasks < v_min then
    v_warn := array_append(v_warn, format('Only %s task(s) with a final outcome in this period (minimum %s). Automatic metrics are not representative.', new.eligible_tasks, v_min));
  end if;
  if new.on_time_rate is null then v_warn := array_append(v_warn, 'No on-time delivery data for this period.'); end if;
  if v_quality is null then v_warn := array_append(v_warn, 'No quality ratings available.'); end if;
  if new.ownership_rating is null or new.communication_rating is null then
    v_warn := array_append(v_warn, 'Manager evaluation (ownership / communication) not yet entered.');
  end if;
  if v_ws.weight_covered < 100 then
    v_warn := array_append(v_warn, format('Score calculated on %s%% of the KPI weight; missing components were excluded.', v_ws.weight_covered));
  end if;

  new.data_warnings := v_warn;
  new.is_provisional := cardinality(v_warn) > 0;
  new.category := case when new.eligible_tasks < v_min then 'Insufficient data'
                       else public.performance_category(new.overall_score) end;

  if new.status = 'finalized' and (tg_op = 'INSERT' or old.status = 'draft') then
    if new.ownership_rating is null or new.communication_rating is null then
      raise exception 'Ownership and communication ratings are required before finalizing';
    end if;
    if coalesce(trim(new.manager_comments), '') = '' then
      raise exception 'Manager comments are required before finalizing';
    end if;
    new.finalized_at := now();
    perform public.notify(new.employee_id, 'review_finalized', 'Your performance review is available',
      to_char(new.period_start, 'Mon YYYY') || ' – ' || to_char(new.period_end, 'Mon YYYY'),
      '/performance/' || new.employee_id, null);
  elsif new.status = 'draft' then
    new.finalized_at := null;
  end if;
  return new;
end $$;
create trigger performance_reviews_compute before insert or update on public.performance_reviews
  for each row execute function public.compute_review();

-- Snapshot automatic metrics for all active employees (pg_cron monthly + on demand by admins).
create or replace function public.refresh_performance_metrics(p_period_type public.review_period, p_start date, p_end date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  m record;
  v int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only administrators can refresh metrics' using errcode = '42501';
  end if;
  for r in select id from public.profiles where is_active and role <> 'admin' loop
    select * into m from public.calc_employee_performance(r.id, p_start, p_end);
    insert into public.performance_metrics (employee_id, period_type, period_start, period_end, eligible_tasks,
        completed_tasks, on_time_tasks, late_tasks, excluded_tasks, completion_rate, on_time_rate, quality_score, effort_hours, computed_at)
    values (r.id, p_period_type, p_start, p_end, m.eligible_tasks, m.completed_tasks, m.on_time_tasks,
        m.late_tasks + m.missed_tasks, m.excluded_tasks, m.completion_rate, m.on_time_rate, m.quality_score, m.effort_hours, now())
    on conflict (employee_id, period_type, period_start) do update set
      period_end = excluded.period_end, eligible_tasks = excluded.eligible_tasks, completed_tasks = excluded.completed_tasks,
      on_time_tasks = excluded.on_time_tasks, late_tasks = excluded.late_tasks, excluded_tasks = excluded.excluded_tasks,
      completion_rate = excluded.completion_rate, on_time_rate = excluded.on_time_rate,
      quality_score = excluded.quality_score, effort_hours = excluded.effort_hours, computed_at = now();
    v := v + 1;
  end loop;
  return v;
end $$;
revoke execute on function public.refresh_performance_metrics(public.review_period, date, date) from public, anon;
grant execute on function public.refresh_performance_metrics(public.review_period, date, date) to authenticated, service_role;

-- ---------- Workload ----------
create or replace function public.working_days_between(p_from date, p_days int) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from generate_series(p_from, p_from + greatest(p_days, 1) - 1, interval '1 day') d
   where extract(isodow from d)::int in (
     select x::int from jsonb_array_elements_text(coalesce(public.setting('working_time') -> 'working_days', '[1,2,3,4,5]')) x)
$$;

create or replace function public.workload_overview(p_horizon_days int default null, p_department uuid default null)
returns table (
  user_id uuid, full_name text, employee_code text, designation text, department_id uuid, department_name text,
  active_tasks int, pending_tasks int, in_progress_tasks int, blocked_tasks int, high_priority_tasks int, overdue_tasks int,
  remaining_hours numeric, estimated_hours_total numeric, actual_hours_30d numeric,
  capacity_hours numeric, available_hours numeric, utilization numeric, category text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_wl jsonb := coalesce(public.setting('workload'), '{}');
  v_wt jsonb := coalesce(public.setting('working_time'), '{}');
  v_h int := coalesce(p_horizon_days, (v_wl ->> 'horizon_days')::int, 10);
  v_today date := public.app_today();
  v_wdays int := public.working_days_between(public.app_today(), coalesce(p_horizon_days, (v_wl ->> 'horizon_days')::int, 10));
  v_days_per_week int := greatest(jsonb_array_length(coalesce(v_wt -> 'working_days', '[1,2,3,4,5]')), 1);
  v_hpd numeric := coalesce((v_wt ->> 'hours_per_day')::numeric, 8);
  v_default numeric := coalesce((public.setting('performance_rules') ->> 'default_estimated_hours')::numeric, 4);
  v_under numeric := coalesce((v_wl ->> 'underutilized_below')::numeric, 60);
  v_bal numeric := coalesce((v_wl ->> 'balanced_up_to')::numeric, 90);
  v_high numeric := coalesce((v_wl ->> 'high_up_to')::numeric, 110);
begin
  return query
  with emp as (
    select p.*, d.name as dept_name,
           v_wdays * coalesce(p.weekly_capacity_hours / v_days_per_week, v_hpd) as cap
      from public.profiles p left join public.departments d on d.id = p.department_id
     where p.is_active and p.role <> 'admin'
       and (auth.uid() is null or public.can_view_user_data(p.id))
       and (p_department is null or p.department_id = p_department)
  ), work as (
    select a.user_id, t.*,
           (select count(*) from public.task_assignees x where x.task_id = t.id) as n_assignees
      from public.tasks t join public.task_assignees a on a.task_id = t.id
     where t.status not in ('completed', 'cancelled')
       and not exists (select 1 from public.tasks c where c.parent_task_id = t.id)
  ), agg as (
    select w.user_id,
      count(*)::int as active_tasks,
      count(*) filter (where w.status = 'not_started')::int as pending_tasks,
      count(*) filter (where w.status in ('in_progress', 'under_review'))::int as in_progress_tasks,
      count(*) filter (where w.status = 'blocked')::int as blocked_tasks,
      count(*) filter (where w.priority in ('critical', 'high'))::int as high_priority_tasks,
      count(*) filter (where w.due_date < v_today)::int as overdue_tasks,
      round(sum(case when w.start_date < v_today + v_h
                     then coalesce(w.estimated_hours, v_default) * (100 - w.completion_percentage) / 100.0 / w.n_assignees
                     else 0 end), 2) as remaining_hours,
      round(sum(coalesce(w.estimated_hours, v_default) / w.n_assignees), 2) as est_total
    from work w group by w.user_id
  ), act as (
    select dp.user_id, sum(coalesce(i.actual_hours, 0)) as hrs
      from public.daily_plans dp join public.daily_plan_items i on i.plan_id = dp.id
     where dp.plan_date > v_today - 30 group by dp.user_id
  )
  select e.id, e.full_name, e.employee_code, e.designation, e.department_id, e.dept_name,
         coalesce(a.active_tasks, 0), coalesce(a.pending_tasks, 0), coalesce(a.in_progress_tasks, 0),
         coalesce(a.blocked_tasks, 0), coalesce(a.high_priority_tasks, 0), coalesce(a.overdue_tasks, 0),
         coalesce(a.remaining_hours, 0), coalesce(a.est_total, 0), coalesce(round(act.hrs, 2), 0),
         round(e.cap, 2), round(greatest(e.cap - coalesce(a.remaining_hours, 0), 0), 2),
         case when e.cap > 0 then round(100 * coalesce(a.remaining_hours, 0) / e.cap, 1) end,
         case when e.cap <= 0 then 'No capacity'
              when 100 * coalesce(a.remaining_hours, 0) / e.cap < v_under then 'Underutilized'
              when 100 * coalesce(a.remaining_hours, 0) / e.cap <= v_bal then 'Balanced'
              when 100 * coalesce(a.remaining_hours, 0) / e.cap <= v_high then 'High Workload'
              else 'Overloaded' end
    from emp e
    left join agg a on a.user_id = e.id
    left join act on act.user_id = e.id
   order by 18 desc nulls last, e.full_name;
end $$;
revoke execute on function public.workload_overview(int, uuid) from public, anon;
grant execute on function public.workload_overview(int, uuid) to authenticated, service_role;

create or replace function public.record_workload_snapshot() returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only administrators can record snapshots' using errcode = '42501';
  end if;
  insert into public.workload_records (user_id, record_date, active_tasks, high_priority_tasks, overdue_tasks,
      remaining_hours, capacity_hours, utilization, category)
  select w.user_id, public.app_today(), w.active_tasks, w.high_priority_tasks, w.overdue_tasks,
         w.remaining_hours, w.capacity_hours, w.utilization, w.category
    from public.workload_overview() w
  on conflict (user_id, record_date) do update set active_tasks = excluded.active_tasks,
    high_priority_tasks = excluded.high_priority_tasks, overdue_tasks = excluded.overdue_tasks,
    remaining_hours = excluded.remaining_hours, capacity_hours = excluded.capacity_hours,
    utilization = excluded.utilization, category = excluded.category;
  get diagnostics v = row_count;
  return v;
end $$;
revoke execute on function public.record_workload_snapshot() from public, anon;
grant execute on function public.record_workload_snapshot() to authenticated, service_role;

-- ---------- Employee directory with live counters ----------
create or replace view public.employee_directory with (security_invoker = true) as
select
  p.*,
  d.name as department_name,
  tm.name as team_name,
  mg.full_name as manager_name,
  (select count(*) from public.task_assignees a join public.tasks t on t.id = a.task_id
    where a.user_id = p.id and t.status not in ('completed', 'cancelled'))::int as active_tasks,
  (select count(*) from public.task_assignees a join public.tasks t on t.id = a.task_id
    where a.user_id = p.id and t.status = 'completed')::int as completed_tasks,
  (select count(*) from public.task_assignees a join public.tasks t on t.id = a.task_id
    where a.user_id = p.id and t.status not in ('completed', 'cancelled') and t.due_date < public.app_today())::int as overdue_tasks,
  (select r.overall_score from public.performance_reviews r where r.employee_id = p.id and r.status = 'finalized'
    order by r.period_end desc limit 1) as latest_score,
  (select r.category from public.performance_reviews r where r.employee_id = p.id and r.status = 'finalized'
    order by r.period_end desc limit 1) as latest_category
from public.profiles p
left join public.departments d on d.id = p.department_id
left join public.teams tm on tm.id = p.team_id
left join public.profiles mg on mg.id = p.manager_id;

-- ---------- Department performance ----------
create or replace function public.department_performance(p_from date, p_to date)
returns table (department_id uuid, department_name text, employees int, tasks_due int, completed int,
               on_time int, overdue_open int, cancelled int, completion_rate numeric, on_time_rate numeric, avg_quality numeric)
language sql stable security invoker set search_path = '' as $$
  select d.id, d.name,
    (select count(*) from public.profiles p where p.department_id = d.id and p.is_active)::int,
    count(t.id) filter (where t.status <> 'cancelled')::int,
    count(t.id) filter (where t.status = 'completed')::int,
    count(t.id) filter (where t.completed_on_time)::int,
    count(t.id) filter (where t.is_overdue)::int,
    count(t.id) filter (where t.status = 'cancelled')::int,
    round(100.0 * count(t.id) filter (where t.status = 'completed')
          / nullif(count(t.id) filter (where t.status <> 'cancelled' and (t.status = 'completed' or t.due_date < public.app_today())), 0), 1),
    round(100.0 * count(t.id) filter (where t.completed_on_time)
          / nullif(count(t.id) filter (where t.status = 'completed'), 0), 1),
    round(avg(t.quality_rating), 2)
  from public.departments d
  left join public.task_overview t on t.department_id = d.id and t.due_date between p_from and p_to
  where d.is_active
  group by d.id, d.name
  order by d.name
$$;

-- ---------- Executive dashboard (single round-trip; RLS of caller applies) ----------
create or replace function public.dashboard_summary(p_from date, p_to date, p_granularity text default 'week',
    p_department uuid default null, p_employee uuid default null, p_project uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_today date := public.app_today();
  v_week_end date := (date_trunc('week', public.app_today()) + interval '6 days')::date;
  v_gran text := case when p_granularity in ('day', 'week', 'month') then p_granularity else 'week' end;
  v_tz text := coalesce(public.setting('company') ->> 'timezone', 'UTC');
  v jsonb;
begin
  with _dash_tasks as materialized (
    select t.* from public.task_overview t
     where (p_department is null or t.department_id = p_department)
       and (p_project is null or t.project_id = p_project)
       and (p_employee is null or p_employee = any(t.assignee_ids))
  )
  select jsonb_build_object(
    'kpis', (select jsonb_build_object(
        'total_employees', (select count(*) from public.profiles p where p.is_active and p.role <> 'admin'
                              and (p_department is null or p.department_id = p_department)),
        'assigned_in_period', count(*) filter (where (assigned_at at time zone v_tz)::date between p_from and p_to),
        'due_in_period', count(*) filter (where due_date between p_from and p_to and status <> 'cancelled'),
        'completed_in_period', count(*) filter (where status = 'completed' and (completed_at at time zone v_tz)::date between p_from and p_to),
        'pending', count(*) filter (where status = 'not_started' and not is_overdue),
        'in_progress', count(*) filter (where status in ('in_progress', 'under_review', 'blocked') and not is_overdue),
        'under_review', count(*) filter (where status = 'under_review'),
        'blocked', count(*) filter (where status = 'blocked'),
        'overdue', count(*) filter (where is_overdue),
        'due_today', count(*) filter (where due_date = v_today and status not in ('completed', 'cancelled')),
        'due_this_week', count(*) filter (where due_date between v_today and v_week_end and status not in ('completed', 'cancelled')),
        'completion_rate', round(100.0 * count(*) filter (where due_date between p_from and p_to and status = 'completed')
             / nullif(count(*) filter (where due_date between p_from and p_to and status <> 'cancelled'), 0), 1),
        'on_time_rate', round(100.0 * count(*) filter (where completed_on_time and (completed_at at time zone v_tz)::date between p_from and p_to)
             / nullif(count(*) filter (where status = 'completed' and (completed_at at time zone v_tz)::date between p_from and p_to), 0), 1),
        'avg_completion_days', round(avg(extract(epoch from (completed_at - (start_date::timestamp at time zone v_tz))) / 86400.0)
             filter (where status = 'completed' and (completed_at at time zone v_tz)::date between p_from and p_to)::numeric, 1),
        'active_projects', (select count(*) from public.projects pr where pr.status in ('planning', 'active')
                              and (p_department is null or pr.department_id = p_department)
                              and (p_project is null or pr.id = p_project))
      ) from _dash_tasks),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object(
        'bucket', b.bucket,
        'completed', (select count(*) from _dash_tasks t where t.status = 'completed'
                        and (t.completed_at at time zone v_tz)::date >= b.bucket and (t.completed_at at time zone v_tz)::date < b.next_bucket),
        'created', (select count(*) from _dash_tasks t where (t.assigned_at at time zone v_tz)::date >= b.bucket
                        and (t.assigned_at at time zone v_tz)::date < b.next_bucket),
        'overdue', (select count(*) from _dash_tasks t
                     where t.status <> 'cancelled' and t.due_date < least(b.next_bucket - 1, v_today)
                       and (t.completed_at is null or (t.completed_at at time zone v_tz)::date > least(b.next_bucket - 1, v_today))
                       and (t.assigned_at at time zone v_tz)::date <= least(b.next_bucket - 1, v_today))
      ) order by b.bucket), '[]'::jsonb)
      from (select gs::date as bucket, (gs + ('1 ' || v_gran)::interval)::date as next_bucket
              from generate_series(date_trunc(v_gran, p_from::timestamp), p_to::timestamp, ('1 ' || v_gran)::interval) gs
             where gs::date <= v_today) b),
    'by_status', (select coalesce(jsonb_object_agg(effective_status, n), '{}') from (
        select effective_status, count(*) n from _dash_tasks
         where (due_date between p_from and p_to) or (status not in ('completed', 'cancelled'))
         group by 1) s),
    'by_priority', (select coalesce(jsonb_object_agg(priority, n), '{}') from (
        select priority, count(*) n from _dash_tasks where status not in ('completed', 'cancelled') group by 1) s),
    'by_department', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(department_name, 'Unassigned'),
        'open', open_n, 'completed', done_n, 'overdue', od_n) order by open_n + done_n desc), '[]') from (
        select department_name, count(*) filter (where status not in ('completed', 'cancelled')) open_n,
               count(*) filter (where status = 'completed' and due_date between p_from and p_to) done_n,
               count(*) filter (where is_overdue) od_n
          from _dash_tasks group by 1) s),
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'progress', progress,
        'status', status, 'overdue', overdue_tasks, 'target_date', target_date, 'is_delayed', is_delayed) order by target_date nulls last), '[]')
        from public.project_overview where status in ('planning', 'active', 'on_hold')
         and (p_department is null or department_id = p_department) and (p_project is null or id = p_project)),
    'attention', (select coalesce(jsonb_agg(x order by x ->> 'sort'), '[]') from (
        select jsonb_build_object('id', id, 'task_code', task_code, 'title', title, 'due_date', due_date,
               'priority', priority, 'effective_status', effective_status, 'assignees', assignee_names,
               'sort', case when is_overdue then '0' when status = 'blocked' then '1' else '2' end || to_char(due_date, 'YYYYMMDD')) x
          from _dash_tasks
         where is_overdue or status = 'blocked' or (priority = 'critical' and status not in ('completed', 'cancelled'))
         order by is_overdue desc, due_date limit 8) s)
  ) into v;
  return v;
end $$;
revoke execute on function public.dashboard_summary(date, date, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.dashboard_summary(date, date, text, uuid, uuid, uuid) to authenticated, service_role;
