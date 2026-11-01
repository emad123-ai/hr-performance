-- =====================================================================
-- Migration 2/6: default settings, auth hooks, access helpers, RLS
-- =====================================================================

-- ---------- Default configuration ----------
insert into public.system_settings (key, value, description) values
  ('company', '{"name":"Your Company","timezone":"Asia/Karachi","fiscal_year_start_month":1,"logo_url":null}', 'Company information'),
  ('kpi_weights', '{"completion":30,"on_time":25,"quality":20,"ownership":15,"communication":10}', 'Performance KPI weights (must total 100)'),
  ('evaluation_scale', '{"max":5,"labels":{"1":"Poor","2":"Below expectations","3":"Meets expectations","4":"Exceeds expectations","5":"Outstanding"}}', 'Manager rating scale'),
  ('performance_bands', '[{"min":90,"label":"Excellent"},{"min":80,"label":"Very Good"},{"min":70,"label":"Good"},{"min":60,"label":"Needs Improvement"},{"min":0,"label":"Unsatisfactory"}]', 'Score to category mapping'),
  ('performance_rules', '{"min_tasks_for_evaluation":3,"default_estimated_hours":4,"complexity_multipliers":{"1":1,"2":1.5,"3":2}}', 'Fairness rules for automatic metrics'),
  ('working_time', '{"working_days":[1,2,3,4,5],"hours_per_day":8}', 'Working days (ISO 1=Mon..7=Sun) and hours per day'),
  ('workload', '{"horizon_days":10,"underutilized_below":60,"balanced_up_to":90,"high_up_to":110}', 'Workload utilisation thresholds (%)'),
  ('reminders', '{"days_before_due":[1,3],"notify_overdue":true,"notify_milestones":true}', 'Deadline reminder settings'),
  ('priorities', '{"critical":{"label":"Critical","description":"Business-critical, act immediately","target_days":1},"high":{"label":"High","description":"Important, complete this week","target_days":5},"medium":{"label":"Medium","description":"Normal priority","target_days":10},"low":{"label":"Low","description":"When capacity allows","target_days":20}}', 'Priority definitions'),
  ('statuses', '{"not_started":{"label":"Not Started","color":"#64748b"},"in_progress":{"label":"In Progress","color":"#2563eb"},"under_review":{"label":"Under Review","color":"#7c3aed"},"blocked":{"label":"Blocked","color":"#d97706"},"completed":{"label":"Completed","color":"#16a34a"},"overdue":{"label":"Overdue","color":"#dc2626"},"cancelled":{"label":"Cancelled","color":"#94a3b8"}}', 'Status labels and colours'),
  ('designations', '["HR Manager","Team Lead","HR Executive","HR Officer","Recruitment Specialist","HR Generalist","Compliance Officer","HR Intern"]', 'Designation list');

create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.system_settings where key = p_key
$$;

create or replace function public.app_today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(
    (select value ->> 'timezone' from public.system_settings where key = 'company'), 'UTC'))::date
$$;

-- ---------- Access helpers (SECURITY DEFINER so they can be used inside RLS) ----------
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() in ('admin', 'team_lead'), false)
$$;

-- Does the current user have authority over the target user?
-- admin: everyone. team_lead: members of teams they lead + direct reports.
create or replace function public.manages_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case public.current_app_role()
    when 'admin' then true
    when 'team_lead' then exists (
      select 1 from public.profiles p
      where p.id = p_user and p.id <> auth.uid()
        and (p.manager_id = auth.uid()
             or p.team_id in (select t.id from public.teams t where t.lead_id = auth.uid())))
    else false end
$$;

create or replace function public.can_view_user_data(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_user = auth.uid() and public.current_app_role() is not null) or public.manages_user(p_user)
$$;

create or replace function public.can_view_task(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case public.current_app_role()
    when 'admin' then true
    when 'team_lead' then exists (
        select 1 from public.tasks t where t.id = p_task
          and (t.assigned_by = auth.uid()
               or exists (select 1 from public.task_assignees a where a.task_id = t.id
                          and (a.user_id = auth.uid() or public.manages_user(a.user_id)))))
    when 'employee' then exists (
        select 1 from public.task_assignees a where a.task_id = p_task and a.user_id = auth.uid())
    else false end
$$;

create or replace function public.can_manage_task(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case public.current_app_role()
    when 'admin' then true
    when 'team_lead' then exists (
        select 1 from public.tasks t where t.id = p_task
          and (t.assigned_by = auth.uid()
               or exists (select 1 from public.task_assignees a where a.task_id = t.id
                          and public.manages_user(a.user_id))))
    else false end
$$;

create or replace function public.is_task_assignee(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.task_assignees a where a.task_id = p_task and a.user_id = auth.uid())
$$;

create or replace function public.can_view_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_manager()
      or exists (select 1 from public.projects p where p.id = p_project and p.owner_id = auth.uid())
      or exists (select 1 from public.project_members m where m.project_id = p_project and m.user_id = auth.uid())
      or exists (select 1 from public.tasks t join public.task_assignees a on a.task_id = t.id
                 where t.project_id = p_project and a.user_id = auth.uid())
$$;

create or replace function public.can_manage_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin()
      or (public.current_app_role() = 'team_lead' and exists (
            select 1 from public.projects p where p.id = p_project
              and (p.owner_id = auth.uid() or p.created_by = auth.uid())))
$$;

create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ---------- Audit logging ----------
create or replace function public.write_audit_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_diff jsonb;
  v_id text;
begin
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key',
                   concat_ws(':', coalesce(v_new, v_old) ->> 'project_id', coalesce(v_new, v_old) ->> 'user_id'));
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k)), '{}'::jsonb)
      into v_diff
      from jsonb_object_keys(v_new) k
     where k <> 'updated_at' and (v_old -> k) is distinct from (v_new -> k);
    if v_diff = '{}'::jsonb then return new; end if;
  else
    v_diff := coalesce(v_new, v_old);
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_diff);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','departments','teams','categories','projects','project_members',
                           'system_settings','performance_reviews']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.write_audit_log()', t || '_audit', t);
  end loop;
end $$;

-- ---------- New auth user -> profile ----------
-- Role is taken ONLY from app_metadata (settable exclusively with the service-role key),
-- never from user_metadata (which end users can edit).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role;
begin
  v_role := case new.raw_app_meta_data ->> 'role'
              when 'admin' then 'admin'::public.app_role
              when 'team_lead' then 'team_lead'::public.app_role
              else 'employee'::public.app_role end;
  insert into public.profiles (id, full_name, email, role)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
          lower(new.email),
          v_role)
  on conflict (id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Profile guard: protect role/active flags and keep at least one admin ----------
create or replace function public.guard_profile_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Defence in depth (RLS already restricts updates to admins). auth.uid() is NULL for trusted server jobs.
  if auth.uid() is not null and not public.is_admin() then
    if coalesce(current_setting('app.self_service', true), '') = 'on' and new.id = auth.uid()
       and (to_jsonb(new) - 'phone' - 'avatar_url' - 'updated_at') = (to_jsonb(old) - 'phone' - 'avatar_url' - 'updated_at') then
      return new;
    end if;
    raise exception 'Only administrators can modify employee records' using errcode = '42501';
  end if;
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active) then
    if (select count(*) from public.profiles where role = 'admin' and is_active and id <> old.id) = 0 then
      raise exception 'At least one active administrator is required';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- Self-service profile update (phone/avatar only).
create or replace function public.update_my_profile(p_phone text, p_avatar_url text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  perform set_config('app.self_service', 'on', true);
  update public.profiles set phone = nullif(trim(p_phone), ''), avatar_url = coalesce(p_avatar_url, avatar_url)
   where id = auth.uid();
  perform set_config('app.self_service', '', true);
end $$;

-- Bootstrap helper for the SQL editor (runs as postgres): promote an existing user to admin.
create or replace function public.promote_to_admin(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set role = 'admin', is_active = true where email = lower(p_email);
  if not found then raise exception 'No profile with email %', p_email; end if;
end $$;
revoke execute on function public.promote_to_admin(text) from public, anon, authenticated;

-- Settings validation
create or replace function public.validate_setting() returns trigger
language plpgsql set search_path = '' as $$
declare v_total numeric;
begin
  if new.key = 'kpi_weights' then
    select sum(value::numeric) into v_total from jsonb_each_text(new.value);
    if v_total <> 100 then raise exception 'KPI weights must total 100 (got %)', v_total; end if;
    if exists (select 1 from jsonb_each_text(new.value) where value::numeric < 0) then
      raise exception 'KPI weights cannot be negative';
    end if;
  elsif new.key = 'evaluation_scale' then
    if coalesce((new.value ->> 'max')::int, 0) not between 3 and 10 then
      raise exception 'Evaluation scale maximum must be between 3 and 10';
    end if;
  elsif new.key = 'working_time' then
    if coalesce((new.value ->> 'hours_per_day')::numeric, 0) not between 1 and 24 then
      raise exception 'Hours per day must be between 1 and 24';
    end if;
    if jsonb_array_length(coalesce(new.value -> 'working_days', '[]')) = 0 then
      raise exception 'At least one working day is required';
    end if;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger system_settings_validate before insert or update on public.system_settings
  for each row execute function public.validate_setting();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.categories enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_activity_logs enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_plan_items enable row level security;
alter table public.performance_metrics enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.workload_records enable row level security;
alter table public.system_settings enable row level security;
alter table public.audit_logs enable row level security;

-- Reference data: readable by any active user, writable by admins.
create policy departments_read on public.departments for select to authenticated using (public.current_app_role() is not null);
create policy departments_admin on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy teams_read on public.teams for select to authenticated using (public.current_app_role() is not null);
create policy teams_admin on public.teams for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_read on public.categories for select to authenticated using (public.current_app_role() is not null);
create policy categories_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_read on public.system_settings for select to authenticated using (public.current_app_role() is not null);
create policy settings_admin on public.system_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profiles: colleague directory (name, designation, department) is visible to active users;
-- only admins modify. Inserts happen through the auth trigger (service role).
create policy profiles_read on public.profiles for select to authenticated using (public.current_app_role() is not null);
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Projects
create policy projects_read on public.projects for select to authenticated using (public.can_view_project(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_manager() and created_by = auth.uid());
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_project(id)) with check (public.can_manage_project(id));
create policy projects_delete on public.projects for delete to authenticated using (public.is_admin());

create policy project_members_read on public.project_members for select to authenticated using (public.can_view_project(project_id));
create policy project_members_write on public.project_members for all to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));

create policy milestones_read on public.project_milestones for select to authenticated using (public.can_view_project(project_id));
create policy milestones_write on public.project_milestones for all to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));

-- Tasks: employees can only read tasks assigned to them. All workflow changes go through
-- SECURITY DEFINER functions (see migration 3); managers may edit descriptive fields directly.
create policy tasks_read on public.tasks for select to authenticated using (public.can_view_task(id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_manage_task(id)) with check (public.can_manage_task(id));
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_admin());

create policy task_assignees_read on public.task_assignees for select to authenticated using (public.can_view_task(task_id));

create policy task_comments_read on public.task_comments for select to authenticated using (public.can_view_task(task_id));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_view_task(task_id) and comment_type in ('comment', 'progress', 'blocker', 'feedback'));
create policy task_comments_update_own on public.task_comments for update to authenticated
  using (author_id = auth.uid() and comment_type = 'comment') with check (author_id = auth.uid() and comment_type = 'comment');

create policy task_attachments_read on public.task_attachments for select to authenticated using (public.can_view_task(task_id));
create policy task_attachments_insert on public.task_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_view_task(task_id)
              and storage_path like task_id::text || '/%');
create policy task_attachments_delete on public.task_attachments for delete to authenticated
  using (uploaded_by = auth.uid() or public.can_manage_task(task_id));

create policy task_activity_read on public.task_activity_logs for select to authenticated using (public.can_view_task(task_id));

create policy task_dependencies_read on public.task_dependencies for select to authenticated using (public.can_view_task(task_id));
create policy task_dependencies_write on public.task_dependencies for all to authenticated
  using (public.can_manage_task(task_id)) with check (public.can_manage_task(task_id) and public.can_view_task(depends_on_id));

-- Daily planner: owner writes; owner + their managers read.
create policy daily_plans_read on public.daily_plans for select to authenticated using (public.can_view_user_data(user_id));
create policy daily_plans_write on public.daily_plans for all to authenticated
  using (user_id = auth.uid() and public.current_app_role() is not null)
  with check (user_id = auth.uid() and public.current_app_role() is not null);
create policy daily_plan_items_read on public.daily_plan_items for select to authenticated
  using (exists (select 1 from public.daily_plans p where p.id = plan_id and public.can_view_user_data(p.user_id)));
create policy daily_plan_items_write on public.daily_plan_items for all to authenticated
  using (exists (select 1 from public.daily_plans p where p.id = plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.daily_plans p where p.id = plan_id and p.user_id = auth.uid()));

-- Performance: employees read their own (finalized reviews only); managers read/write for people they manage.
create policy metrics_read on public.performance_metrics for select to authenticated using (public.can_view_user_data(employee_id));
create policy reviews_read on public.performance_reviews for select to authenticated
  using (public.manages_user(employee_id) or (employee_id = auth.uid() and status = 'finalized'));
create policy reviews_insert on public.performance_reviews for insert to authenticated
  with check (public.manages_user(employee_id) and reviewer_id = auth.uid());
create policy reviews_update on public.performance_reviews for update to authenticated
  using (public.manages_user(employee_id)) with check (public.manages_user(employee_id));
create policy reviews_delete on public.performance_reviews for delete to authenticated
  using (public.manages_user(employee_id) and status = 'draft');

-- Notifications: own only. Created by server-side functions; marked read via RPC.
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy notification_prefs_own on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy workload_read on public.workload_records for select to authenticated using (public.can_view_user_data(user_id));
create policy audit_read on public.audit_logs for select to authenticated using (public.is_admin());

-- Nothing is exposed to anonymous users.
revoke all on all tables in schema public from anon;
