-- =====================================================================
-- Migration 3/6: notifications, task workflow functions, history triggers
-- All state transitions run through SECURITY DEFINER functions that check
-- permissions explicitly and always write to task_activity_logs.
-- =====================================================================

-- ---------- Notifications ----------
create or replace function public.notify(p_user uuid, p_type text, p_title text, p_body text,
                                         p_link text default null, p_task uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  if exists (select 1 from public.notification_preferences np
             where np.user_id = p_user and p_type = any(np.disabled_types)) then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = p_user and is_active) then return; end if;
  insert into public.notifications (user_id, type, title, body, link, task_id)
  values (p_user, p_type, p_title, p_body, p_link, p_task);
end $$;
revoke execute on function public.notify(uuid, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.notify_task_assignees(p_task uuid, p_type text, p_title text, p_body text,
                                                        p_exclude uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select user_id from public.task_assignees where task_id = p_task and user_id is distinct from p_exclude loop
    perform public.notify(r.user_id, p_type, p_title, p_body, '/tasks/' || p_task, p_task);
  end loop;
end $$;
revoke execute on function public.notify_task_assignees(uuid, text, text, text, uuid) from public, anon, authenticated;

-- Supervisors of a task: the assigner plus team leads/managers of the assignees.
create or replace function public.task_supervisors(p_task uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct u from (
    select t.assigned_by as u from public.tasks t where t.id = p_task
    union
    select p.manager_id from public.task_assignees a join public.profiles p on p.id = a.user_id where a.task_id = p_task
    union
    select tm.lead_id from public.task_assignees a join public.profiles p on p.id = a.user_id
      join public.teams tm on tm.id = p.team_id where a.task_id = p_task
  ) s where u is not null
$$;
revoke execute on function public.task_supervisors(uuid) from public, anon, authenticated;

create or replace function public.notify_task_supervisors(p_task uuid, p_type text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  for v in select * from public.task_supervisors(p_task) loop
    if v is distinct from auth.uid() then
      perform public.notify(v, p_type, p_title, p_body, '/tasks/' || p_task, p_task);
    end if;
  end loop;
end $$;
revoke execute on function public.notify_task_supervisors(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  update public.notifications set is_read = true, read_at = now()
   where user_id = auth.uid() and not is_read and (p_ids is null or id = any(p_ids));
  get diagnostics v = row_count;
  return v;
end $$;

-- ---------- Activity log helper ----------
create or replace function public.log_task_activity(p_task uuid, p_action text, p_field text default null,
    p_old text default null, p_new text default null, p_reason text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.task_activity_logs (task_id, actor_id, action, field, old_value, new_value, reason)
  values (p_task, auth.uid(), p_action, p_field, p_old, p_new, p_reason);
$$;
revoke execute on function public.log_task_activity(uuid, text, text, text, text, text) from public, anon, authenticated;

-- ---------- Guard: protected task fields can only change through workflow functions ----------
create or replace function public.guard_task_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.status is distinct from old.status
       or new.due_date is distinct from old.due_date
       or new.original_due_date is distinct from old.original_due_date
       or new.completed_at is distinct from old.completed_at
       or new.submitted_at is distinct from old.submitted_at
       or new.approved_by is distinct from old.approved_by
       or new.quality_rating is distinct from old.quality_rating
       or new.assigned_by is distinct from old.assigned_by
       or new.assigned_at is distinct from old.assigned_at
       or new.task_code is distinct from old.task_code
       or new.delay_cause is distinct from old.delay_cause
       or new.completion_percentage is distinct from old.completion_percentage
       or new.is_demo is distinct from old.is_demo then
      raise exception 'Status, deadline, completion and approval fields can only be changed through the task workflow'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger tasks_guard before update on public.tasks for each row execute function public.guard_task_update();

-- ---------- History: log every field change on tasks ----------
create or replace function public.log_task_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_reason text := nullif(current_setting('app.change_reason', true), '');
begin
  for k in select jsonb_object_keys(v_new) loop
    continue when k in ('updated_at', 'overdue_notified_at', 'submitted_at', 'approved_by');
    if (v_old -> k) is distinct from (v_new -> k) then
      insert into public.task_activity_logs (task_id, actor_id, action, field, old_value, new_value, reason)
      values (new.id, auth.uid(), 'field_changed', k, v_old ->> k, v_new ->> k, v_reason);
    end if;
  end loop;
  if new.priority is distinct from old.priority then
    perform public.notify_task_assignees(new.id, 'priority_changed', 'Priority changed: ' || new.title,
      'Priority changed from ' || old.priority || ' to ' || new.priority, auth.uid());
  end if;
  return new;
end $$;
create trigger tasks_log_changes after update on public.tasks for each row execute function public.log_task_changes();

-- History rows are append-only, even for managers.
create or replace function public.prevent_history_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'History records cannot be modified' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger task_activity_immutable before update or delete on public.task_activity_logs
  for each row execute function public.prevent_history_mutation();
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_history_mutation();

-- Comments & attachments are reflected in the activity history.
create or replace function public.log_task_child_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- When the parent task itself is being deleted (cascade), there is nothing to log against.
  if tg_op = 'DELETE' and not exists (select 1 from public.tasks where id = old.task_id) then
    return old;
  end if;
  if tg_table_name = 'task_comments' then
    insert into public.task_activity_logs (task_id, actor_id, action, new_value)
    values (new.task_id, new.author_id, 'comment_' || new.comment_type, left(new.body, 500));
    if new.comment_type in ('comment', 'progress') then
      perform public.notify_task_assignees(new.task_id, 'task_comment', 'New comment on a task', left(new.body, 140), new.author_id);
    end if;
  elsif tg_table_name = 'task_attachments' then
    if tg_op = 'INSERT' then
      insert into public.task_activity_logs (task_id, actor_id, action, new_value)
      values (new.task_id, new.uploaded_by, 'attachment_added', new.file_name);
    else
      insert into public.task_activity_logs (task_id, actor_id, action, old_value)
      values (old.task_id, auth.uid(), 'attachment_removed', old.file_name);
      return old;
    end if;
  elsif tg_table_name = 'task_dependencies' then
    if tg_op = 'INSERT' then
      insert into public.task_activity_logs (task_id, actor_id, action, new_value)
      values (new.task_id, auth.uid(), 'dependency_added', (select task_code from public.tasks where id = new.depends_on_id));
    else
      insert into public.task_activity_logs (task_id, actor_id, action, old_value)
      values (old.task_id, auth.uid(), 'dependency_removed', (select task_code from public.tasks where id = old.depends_on_id));
      return old;
    end if;
  end if;
  return new;
end $$;
create trigger task_comments_activity after insert on public.task_comments for each row execute function public.log_task_child_activity();
create trigger task_attachments_activity after insert or delete on public.task_attachments for each row execute function public.log_task_child_activity();
create trigger task_dependencies_activity after insert or delete on public.task_dependencies for each row execute function public.log_task_child_activity();

-- Dependency cycles are rejected.
create or replace function public.check_dependency_cycle() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    with recursive chain(id) as (
      select new.depends_on_id
      union
      select d.depends_on_id from public.task_dependencies d join chain c on d.task_id = c.id
    ) select 1 from chain where id = new.task_id
  ) then
    raise exception 'This dependency would create a circular chain';
  end if;
  return new;
end $$;
create trigger task_dependencies_no_cycle before insert or update on public.task_dependencies
  for each row execute function public.check_dependency_cycle();

-- ---------- Internal helpers ----------
create or replace function public.assert_can_manage_task(p_task uuid) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if not public.can_manage_task(p_task) then
    raise exception 'You are not authorised to manage this task' using errcode = '42501';
  end if;
  return t;
end $$;
revoke execute on function public.assert_can_manage_task(uuid) from public, anon, authenticated;

create or replace function public.assert_assignees_allowed(p_assignees uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if p_assignees is null or cardinality(p_assignees) = 0 then
    raise exception 'At least one assignee is required';
  end if;
  foreach v in array p_assignees loop
    if not exists (select 1 from public.profiles where id = v and is_active) then
      raise exception 'Assignee % is not an active employee', v;
    end if;
    if not (public.is_admin() or v = auth.uid() or public.manages_user(v)) then
      raise exception 'You can only assign tasks to members of your own team' using errcode = '42501';
    end if;
  end loop;
end $$;
revoke execute on function public.assert_assignees_allowed(uuid[]) from public, anon, authenticated;

-- ---------- Create task ----------
create or replace function public.create_task(p jsonb, p_assignees uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_user uuid;
  v_title text;
begin
  if not public.is_manager() then
    raise exception 'Only managers and team leads can create tasks' using errcode = '42501';
  end if;
  perform public.assert_assignees_allowed(p_assignees);

  if (p ->> 'parent_task_id') is not null and not public.can_view_task((p ->> 'parent_task_id')::uuid) then
    raise exception 'Parent task not accessible' using errcode = '42501';
  end if;

  insert into public.tasks (title, description, department_id, project_id, milestone_id, category_id, parent_task_id,
      assigned_by, start_date, due_date, priority, complexity, estimated_hours, recurrence, recurrence_end_date,
      recurrence_source_id)
  values (
      trim(p ->> 'title'), nullif(p ->> 'description', ''),
      (p ->> 'department_id')::uuid, (p ->> 'project_id')::uuid, (p ->> 'milestone_id')::uuid,
      (p ->> 'category_id')::uuid, (p ->> 'parent_task_id')::uuid,
      auth.uid(),
      coalesce((p ->> 'start_date')::date, public.app_today()),
      (p ->> 'due_date')::date,
      coalesce((p ->> 'priority')::public.task_priority, 'medium'),
      coalesce((p ->> 'complexity')::smallint, 2),
      (p ->> 'estimated_hours')::numeric,
      coalesce((p ->> 'recurrence')::public.recurrence_rule, 'none'),
      (p ->> 'recurrence_end_date')::date,
      (p ->> 'recurrence_source_id')::uuid)
  returning id, title into v_id, v_title;

  insert into public.task_assignees (task_id, user_id, assigned_by)
  select v_id, u, auth.uid() from unnest(p_assignees) u on conflict do nothing;

  perform public.log_task_activity(v_id, 'created', null, null, v_title);
  foreach v_user in array p_assignees loop
    perform public.log_task_activity(v_id, 'assignee_added', 'assignee', null,
      (select full_name from public.profiles where id = v_user));
    if v_user <> auth.uid() then
      perform public.notify(v_user, 'task_assigned', 'New task assigned: ' || v_title,
        'Due ' || to_char((p ->> 'due_date')::date, 'DD Mon YYYY'), '/tasks/' || v_id, v_id);
    end if;
  end loop;
  return v_id;
end $$;

-- ---------- Progress updates (assignees or managers) ----------
create or replace function public.update_task_progress(p_task uuid, p_percentage int, p_status public.task_status,
    p_note text default null, p_hours_spent numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if not (public.is_task_assignee(p_task) or public.can_manage_task(p_task)) then
    raise exception 'You are not assigned to this task' using errcode = '42501';
  end if;
  if t.status in ('completed', 'cancelled') then
    raise exception 'This task is % – ask a manager to reopen it', t.status;
  end if;
  if t.status = 'under_review' and not public.can_manage_task(p_task) then
    raise exception 'This task is awaiting review';
  end if;
  if p_status not in ('not_started', 'in_progress', 'blocked') then
    raise exception 'Use submit for review / approve to change the status to %', p_status;
  end if;
  if p_percentage < 0 or p_percentage > 100 then raise exception 'Percentage must be 0-100'; end if;
  if p_status = 'blocked' and coalesce(trim(p_note), '') = '' then
    raise exception 'Please describe the blocker';
  end if;
  if p_hours_spent is not null and (p_hours_spent < 0 or p_hours_spent > 24) then
    raise exception 'Hours spent must be between 0 and 24 per update';
  end if;

  perform set_config('app.change_reason', coalesce(p_note, ''), true);
  update public.tasks set
    completion_percentage = p_percentage,
    status = case when p_status = 'not_started' and p_percentage > 0 then 'in_progress' else p_status end,
    blocker_reason = case when p_status = 'blocked' then p_note else null end,
    actual_hours = actual_hours + coalesce(p_hours_spent, 0)
  where id = p_task;
  perform set_config('app.change_reason', '', true);

  if coalesce(trim(p_note), '') <> '' then
    insert into public.task_comments (task_id, author_id, body, comment_type)
    values (p_task, auth.uid(), p_note, case when p_status = 'blocked' then 'blocker' else 'progress' end);
  end if;
  if p_status = 'blocked' and t.status <> 'blocked' then
    perform public.notify_task_supervisors(p_task, 'task_blocked', 'Task blocked: ' || t.title, p_note);
  end if;
end $$;

-- ---------- Submit for review (assignees) ----------
create or replace function public.submit_task(p_task uuid, p_note text default null, p_evidence text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  v_open int;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if not public.is_task_assignee(p_task) then
    raise exception 'Only assignees can submit a task for review' using errcode = '42501';
  end if;
  if t.status not in ('not_started', 'in_progress', 'blocked') then
    raise exception 'Task cannot be submitted from status %', t.status;
  end if;
  select count(*) into v_open from public.task_dependencies d join public.tasks dt on dt.id = d.depends_on_id
   where d.task_id = p_task and dt.status not in ('completed', 'cancelled');
  if v_open > 0 then
    raise exception 'This task depends on % unfinished task(s)', v_open;
  end if;
  if exists (select 1 from public.tasks s where s.parent_task_id = p_task and s.status not in ('completed', 'cancelled')) then
    raise exception 'All subtasks must be completed first';
  end if;

  perform set_config('app.change_reason', coalesce(p_note, 'Submitted for review'), true);
  update public.tasks set status = 'under_review', completion_percentage = 100, submitted_at = now(),
         blocker_reason = null,
         evidence_notes = coalesce(nullif(trim(p_evidence), ''), evidence_notes)
   where id = p_task;
  perform set_config('app.change_reason', '', true);

  insert into public.task_comments (task_id, author_id, body, comment_type)
  values (p_task, auth.uid(), coalesce(nullif(trim(p_note), ''), 'Submitted for review'), 'submission');
  perform public.notify_task_supervisors(p_task, 'task_submitted', 'Task submitted for review: ' || t.title,
    coalesce(p_note, 'Ready for your review'));
end $$;

-- ---------- Spawn next occurrence of a recurring task ----------
create or replace function public.spawn_next_recurrence(p_task uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  v_step interval;
  v_due date;
  v_id uuid;
begin
  select * into t from public.tasks where id = p_task;
  if t.recurrence = 'none' then return null; end if;
  v_step := case t.recurrence when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end;
  v_due := (t.due_date + v_step)::date;
  if t.recurrence_end_date is not null and v_due > t.recurrence_end_date then return null; end if;
  if exists (select 1 from public.tasks where recurrence_source_id = coalesce(t.recurrence_source_id, t.id) and due_date = v_due) then
    return null;
  end if;
  insert into public.tasks (title, description, department_id, project_id, category_id, assigned_by,
      start_date, due_date, priority, complexity, estimated_hours, recurrence, recurrence_end_date, recurrence_source_id, is_demo)
  values (t.title, t.description, t.department_id, t.project_id, t.category_id, t.assigned_by,
      greatest((t.start_date + v_step)::date, public.app_today()), v_due, t.priority, t.complexity, t.estimated_hours,
      t.recurrence, t.recurrence_end_date, coalesce(t.recurrence_source_id, t.id), t.is_demo)
  returning id into v_id;
  insert into public.task_assignees (task_id, user_id, assigned_by)
  select v_id, user_id, t.assigned_by from public.task_assignees where task_id = p_task;
  insert into public.task_activity_logs (task_id, actor_id, action, new_value, reason)
  values (v_id, auth.uid(), 'created', t.title, 'Recurring task generated from ' || t.task_code);
  perform public.notify_task_assignees(v_id, 'task_assigned', 'Recurring task: ' || t.title,
    'Next occurrence due ' || to_char(v_due, 'DD Mon YYYY'));
  return v_id;
end $$;
revoke execute on function public.spawn_next_recurrence(uuid) from public, anon, authenticated;

-- ---------- Review: approve or request changes (managers) ----------
create or replace function public.review_task(p_task uuid, p_decision text, p_quality numeric default null,
    p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  v_scale int := coalesce((public.setting('evaluation_scale') ->> 'max')::int, 5);
begin
  t := public.assert_can_manage_task(p_task);
  if public.is_task_assignee(p_task) and not public.is_admin()
     and not exists (select 1 from public.task_assignees where task_id = p_task and user_id <> auth.uid()) then
    raise exception 'You cannot approve a task that is assigned only to yourself' using errcode = '42501';
  end if;

  if p_decision = 'approve' then
    if t.status in ('completed', 'cancelled') then raise exception 'Task is already %', t.status; end if;
    if p_quality is null or p_quality < 1 or p_quality > v_scale then
      raise exception 'A quality rating between 1 and % is required to approve', v_scale;
    end if;
    perform set_config('app.change_reason', coalesce(p_feedback, 'Approved'), true);
    update public.tasks set status = 'completed', completion_percentage = 100, completed_at = now(),
           approved_by = auth.uid(), quality_rating = p_quality,
           supervisor_feedback = coalesce(nullif(trim(p_feedback), ''), supervisor_feedback), blocker_reason = null
     where id = p_task;
    perform set_config('app.change_reason', '', true);
    perform public.log_task_activity(p_task, 'approved', 'quality_rating', null, p_quality::text, p_feedback);
    perform public.notify_task_assignees(p_task, 'task_approved', 'Task approved: ' || t.title,
      coalesce(p_feedback, 'Great work – your task was approved.'));
    perform public.spawn_next_recurrence(p_task);
  elsif p_decision = 'request_changes' then
    if t.status <> 'under_review' then raise exception 'Only tasks under review can be sent back'; end if;
    if coalesce(trim(p_feedback), '') = '' then raise exception 'Feedback is required when requesting changes'; end if;
    perform set_config('app.change_reason', p_feedback, true);
    update public.tasks set status = 'in_progress', completion_percentage = least(completion_percentage, 90),
           submitted_at = null, supervisor_feedback = p_feedback
     where id = p_task;
    perform set_config('app.change_reason', '', true);
    insert into public.task_comments (task_id, author_id, body, comment_type) values (p_task, auth.uid(), p_feedback, 'feedback');
    perform public.log_task_activity(p_task, 'changes_requested', null, null, null, p_feedback);
    perform public.notify_task_assignees(p_task, 'changes_requested', 'Changes requested: ' || t.title, p_feedback);
  else
    raise exception 'Unknown decision %', p_decision;
  end if;
end $$;

-- ---------- Reopen (managers, reason required) ----------
create or replace function public.reopen_task(p_task uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  t := public.assert_can_manage_task(p_task);
  if t.status not in ('completed', 'cancelled') then raise exception 'Only completed or cancelled tasks can be reopened'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to reopen a task'; end if;
  perform set_config('app.change_reason', p_reason, true);
  update public.tasks set status = 'in_progress', completed_at = null, approved_by = null, quality_rating = null,
         submitted_at = null, cancelled_reason = null,
         completion_percentage = case when t.status = 'completed' then 90 else completion_percentage end
   where id = p_task;
  perform set_config('app.change_reason', '', true);
  perform public.log_task_activity(p_task, 'reopened', 'status', t.status::text, 'in_progress', p_reason);
  perform public.notify_task_assignees(p_task, 'task_reopened', 'Task reopened: ' || t.title, p_reason);
end $$;

-- ---------- Deadline change (managers, reason + cause required) ----------
create or replace function public.change_task_deadline(p_task uuid, p_new_due date, p_reason text,
    p_cause public.delay_cause default 'none')
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  t := public.assert_can_manage_task(p_task);
  if t.status in ('completed', 'cancelled') then raise exception 'Reopen the task before changing its deadline'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to change a deadline'; end if;
  if p_new_due < t.start_date then raise exception 'Due date cannot be before the start date'; end if;
  if p_new_due = t.due_date then raise exception 'The new deadline is the same as the current one'; end if;
  perform set_config('app.change_reason', p_reason, true);
  update public.tasks set due_date = p_new_due, original_due_date = coalesce(original_due_date, t.due_date),
         delay_cause = coalesce(p_cause, 'none'),
         overdue_notified_at = case when p_new_due >= public.app_today() then null else overdue_notified_at end
   where id = p_task;
  perform set_config('app.change_reason', '', true);
  perform public.log_task_activity(p_task, 'deadline_changed', 'due_date', t.due_date::text, p_new_due::text,
    p_reason || ' [cause: ' || coalesce(p_cause, 'none') || ']');
  perform public.notify_task_assignees(p_task, 'deadline_changed', 'Deadline changed: ' || t.title,
    'New due date ' || to_char(p_new_due, 'DD Mon YYYY') || ' – ' || p_reason);
end $$;

-- Classify an existing delay (e.g. external dependency) without moving the deadline.
create or replace function public.set_delay_cause(p_task uuid, p_cause public.delay_cause, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  t := public.assert_can_manage_task(p_task);
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  perform set_config('app.change_reason', p_reason, true);
  update public.tasks set delay_cause = p_cause where id = p_task;
  perform set_config('app.change_reason', '', true);
end $$;

-- ---------- Cancel (managers, reason required) ----------
create or replace function public.cancel_task(p_task uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  t := public.assert_can_manage_task(p_task);
  if t.status in ('completed', 'cancelled') then raise exception 'Task is already %', t.status; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to cancel a task'; end if;
  perform set_config('app.change_reason', p_reason, true);
  update public.tasks set status = 'cancelled', cancelled_reason = p_reason where id = p_task;
  perform set_config('app.change_reason', '', true);
  perform public.log_task_activity(p_task, 'cancelled', 'status', t.status::text, 'cancelled', p_reason);
  perform public.notify_task_assignees(p_task, 'task_cancelled', 'Task cancelled: ' || t.title, p_reason);
end $$;

-- ---------- Reassign (managers) ----------
create or replace function public.reassign_task(p_task uuid, p_assignees uuid[], p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  r record;
begin
  t := public.assert_can_manage_task(p_task);
  if t.status in ('completed', 'cancelled') then raise exception 'Reopen the task before reassigning it'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to reassign a task'; end if;
  perform public.assert_assignees_allowed(p_assignees);

  for r in select a.user_id, p.full_name from public.task_assignees a join public.profiles p on p.id = a.user_id
           where a.task_id = p_task and not (a.user_id = any(p_assignees)) loop
    delete from public.task_assignees where task_id = p_task and user_id = r.user_id;
    perform public.log_task_activity(p_task, 'assignee_removed', 'assignee', r.full_name, null, p_reason);
    perform public.notify(r.user_id, 'task_reassigned', 'Task reassigned: ' || t.title,
      'This task is no longer assigned to you. ' || p_reason, '/tasks', null);
  end loop;

  for r in select u as user_id, p.full_name from unnest(p_assignees) u join public.profiles p on p.id = u
           where not exists (select 1 from public.task_assignees a where a.task_id = p_task and a.user_id = u) loop
    insert into public.task_assignees (task_id, user_id, assigned_by) values (p_task, r.user_id, auth.uid());
    perform public.log_task_activity(p_task, 'assignee_added', 'assignee', null, r.full_name, p_reason);
    perform public.notify(r.user_id, 'task_assigned', 'Task assigned to you: ' || t.title,
      'Due ' || to_char(t.due_date, 'DD Mon YYYY') || '. ' || p_reason, '/tasks/' || p_task, p_task);
  end loop;
end $$;

-- ---------- Escalate (team leads / managers) ----------
create or replace function public.escalate_task(p_task uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  v uuid;
begin
  t := public.assert_can_manage_task(p_task);
  if coalesce(trim(p_note), '') = '' then raise exception 'Please explain the escalation'; end if;
  perform public.log_task_activity(p_task, 'escalated', null, null, null, p_note);
  for v in select id from public.profiles where role = 'admin' and is_active and id <> auth.uid() loop
    perform public.notify(v, 'task_escalated', 'Escalation: ' || t.title, p_note, '/tasks/' || p_task, p_task);
  end loop;
end $$;

-- ---------- Subtasks inherit context ----------
-- (create_task accepts parent_task_id; this keeps department/project aligned by default)
create or replace function public.inherit_parent_context() returns trigger
language plpgsql set search_path = '' as $$
declare p public.tasks;
begin
  if new.parent_task_id is not null then
    select * into p from public.tasks where id = new.parent_task_id;
    if p.parent_task_id is not null then raise exception 'Subtasks can only be one level deep'; end if;
    new.project_id := coalesce(new.project_id, p.project_id);
    new.department_id := coalesce(new.department_id, p.department_id);
    new.category_id := coalesce(new.category_id, p.category_id);
  end if;
  return new;
end $$;
create trigger tasks_inherit_parent before insert on public.tasks for each row execute function public.inherit_parent_context();

-- ---------- Deadline & milestone checks (run by pg_cron and opportunistically by the app) ----------
create or replace function public.run_deadline_checks() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := public.app_today();
  v_rem jsonb := coalesce(public.setting('reminders'), '{}');
  v_days int[];
  r record;
  v_due_soon int := 0;
  v_overdue int := 0;
  v_milestones int := 0;
begin
  select coalesce(array_agg(x::int), '{1}') into v_days from jsonb_array_elements_text(coalesce(v_rem -> 'days_before_due', '[1]')) x;

  -- Approaching deadlines (one reminder per user/task/day)
  for r in
    select t.id, t.title, t.due_date, a.user_id
      from public.tasks t join public.task_assignees a on a.task_id = t.id
     where t.status in ('not_started', 'in_progress', 'blocked')
       and (t.due_date - v_today) = any(v_days || 0)
       and not exists (select 1 from public.notifications n where n.task_id = t.id and n.user_id = a.user_id
                        and n.type = 'deadline_approaching' and n.created_at > now() - interval '20 hours')
  loop
    perform public.notify(r.user_id, 'deadline_approaching',
      case when r.due_date = v_today then 'Due today: ' else 'Deadline approaching: ' end || r.title,
      'Due ' || to_char(r.due_date, 'DD Mon YYYY'), '/tasks/' || r.id, r.id);
    v_due_soon := v_due_soon + 1;
  end loop;

  -- Newly overdue tasks (notify once)
  if coalesce((v_rem ->> 'notify_overdue')::boolean, true) then
    for r in
      select t.id, t.title, t.due_date from public.tasks t
       where t.status not in ('completed', 'cancelled') and t.due_date < v_today and t.overdue_notified_at is null
         and t.status <> 'under_review'
    loop
      perform public.notify_task_assignees(r.id, 'task_overdue', 'Overdue: ' || r.title,
        'This task was due on ' || to_char(r.due_date, 'DD Mon YYYY'));
      perform public.notify_task_supervisors(r.id, 'task_overdue', 'Overdue: ' || r.title,
        'This task was due on ' || to_char(r.due_date, 'DD Mon YYYY'));
      update public.tasks set overdue_notified_at = now() where id = r.id;
      insert into public.task_activity_logs (task_id, actor_id, action, new_value)
      values (r.id, null, 'became_overdue', r.due_date::text);
      v_overdue := v_overdue + 1;
    end loop;
  end if;

  -- Delayed milestones
  if coalesce((v_rem ->> 'notify_milestones')::boolean, true) then
    for r in
      select m.id, m.title, m.due_date, p.owner_id, p.id as project_id, p.name
        from public.project_milestones m join public.projects p on p.id = m.project_id
       where m.status = 'pending' and m.due_date < v_today and m.delay_notified_at is null
    loop
      perform public.notify(r.owner_id, 'milestone_delayed', 'Milestone delayed: ' || r.title,
        r.name || ' – milestone was due ' || to_char(r.due_date, 'DD Mon YYYY'), '/projects/' || r.project_id, null);
      update public.project_milestones set delay_notified_at = now() where id = r.id;
      v_milestones := v_milestones + 1;
    end loop;
  end if;

  return jsonb_build_object('due_soon', v_due_soon, 'overdue', v_overdue, 'milestones', v_milestones, 'ran_at', now());
end $$;
revoke execute on function public.run_deadline_checks() from public, anon;
grant execute on function public.run_deadline_checks() to authenticated, service_role;

-- Public RPC surface for signed-in users (permissions are checked inside each function)
revoke execute on function public.create_task(jsonb, uuid[]) from public, anon;
revoke execute on function public.update_task_progress(uuid, int, public.task_status, text, numeric) from public, anon;
revoke execute on function public.submit_task(uuid, text, text) from public, anon;
revoke execute on function public.review_task(uuid, text, numeric, text) from public, anon;
revoke execute on function public.reopen_task(uuid, text) from public, anon;
revoke execute on function public.change_task_deadline(uuid, date, text, public.delay_cause) from public, anon;
revoke execute on function public.set_delay_cause(uuid, public.delay_cause, text) from public, anon;
revoke execute on function public.cancel_task(uuid, text) from public, anon;
revoke execute on function public.reassign_task(uuid, uuid[], text) from public, anon;
revoke execute on function public.escalate_task(uuid, text) from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.create_task(jsonb, uuid[]), public.update_task_progress(uuid, int, public.task_status, text, numeric),
  public.submit_task(uuid, text, text), public.review_task(uuid, text, numeric, text), public.reopen_task(uuid, text),
  public.change_task_deadline(uuid, date, text, public.delay_cause), public.set_delay_cause(uuid, public.delay_cause, text),
  public.cancel_task(uuid, text), public.reassign_task(uuid, uuid[], text), public.escalate_task(uuid, text),
  public.mark_notifications_read(uuid[]) to authenticated;
