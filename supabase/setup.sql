-- ============================================================================
-- HR Performance Hub – COMPLETE DATABASE SETUP (all migrations in order).
-- Paste into Supabase → SQL Editor → New query → Run. Run ONCE on a new project.
-- Generated from supabase/migrations/*.sql – edit those files, not this one.
-- ============================================================================

-- >>>>>>>>>> 20261101000100_schema.sql
-- =====================================================================
-- HR Team Performance & Task Management – core schema
-- Migration 1/6: types, tables, constraints, indexes
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

-- ---------- Enumerated types ----------
create type public.app_role as enum ('admin', 'team_lead', 'employee');
create type public.employment_status as enum ('active', 'probation', 'on_leave', 'resigned', 'terminated');
create type public.task_status as enum ('not_started', 'in_progress', 'under_review', 'blocked', 'completed', 'cancelled');
create type public.task_priority as enum ('critical', 'high', 'medium', 'low');
create type public.delay_cause as enum ('none', 'employee', 'external', 'management');
create type public.recurrence_rule as enum ('none', 'daily', 'weekly', 'monthly');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');
create type public.milestone_status as enum ('pending', 'completed');
create type public.plan_item_status as enum ('planned', 'completed', 'pending', 'blocked');
create type public.review_period as enum ('monthly', 'quarterly', 'annual');
create type public.review_status as enum ('draft', 'finalized');

-- ---------- Generic updated_at trigger ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Sequences for human-readable IDs ----------
create sequence public.task_code_seq start 1;
create sequence public.project_code_seq start 1;
create sequence public.employee_code_seq start 1;

-- ---------- Organisation ----------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 2 and 100),
  code text unique check (code is null or length(code) <= 20),
  description text,
  head_id uuid,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_code text not null unique default ('EMP-' || lpad(nextval('public.employee_code_seq')::text, 4, '0')),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text not null unique,
  phone text check (phone is null or length(phone) <= 30),
  designation text check (designation is null or length(designation) <= 100),
  department_id uuid references public.departments(id) on delete set null,
  team_id uuid,
  manager_id uuid references public.profiles(id) on delete set null,
  role public.app_role not null default 'employee',
  employment_status public.employment_status not null default 'active',
  is_active boolean not null default true,
  joining_date date,
  weekly_capacity_hours numeric(5,2) check (weekly_capacity_hours is null or weekly_capacity_hours between 0 and 80),
  avatar_url text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_not_own_manager check (manager_id is null or manager_id <> id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 2 and 100),
  description text,
  department_id uuid references public.departments(id) on delete set null,
  lead_id uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add constraint profiles_team_fk foreign key (team_id) references public.teams(id) on delete set null;
alter table public.departments add constraint departments_head_fk foreign key (head_id) references public.profiles(id) on delete set null;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  group_name text not null check (length(trim(group_name)) between 2 and 60),
  name text not null check (length(trim(name)) between 2 and 80),
  description text,
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_name, name)
);

-- ---------- Projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique default ('PRJ-' || lpad(nextval('public.project_code_seq')::text, 3, '0')),
  name text not null check (length(trim(name)) between 2 and 150),
  description text,
  owner_id uuid references public.profiles(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  start_date date,
  target_date date,
  completed_at timestamptz,
  status public.project_status not null default 'planning',
  priority public.task_priority not null default 'medium',
  remarks text,
  created_by uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_dates check (target_date is null or start_date is null or target_date >= start_date)
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (length(member_role) <= 60),
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 150),
  description text,
  due_date date not null,
  status public.milestone_status not null default 'pending',
  completed_at timestamptz,
  delay_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Tasks ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  task_code text not null unique default ('TSK-' || lpad(nextval('public.task_code_seq')::text, 5, '0')),
  title text not null check (length(trim(title)) between 3 and 200),
  description text,
  department_id uuid references public.departments(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  milestone_id uuid references public.project_milestones(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  start_date date not null default current_date,
  due_date date not null,
  original_due_date date,
  priority public.task_priority not null default 'medium',
  complexity smallint not null default 2 check (complexity between 1 and 3),
  estimated_hours numeric(6,2) check (estimated_hours is null or estimated_hours between 0 and 2000),
  actual_hours numeric(7,2) not null default 0 check (actual_hours >= 0),
  status public.task_status not null default 'not_started',
  completion_percentage smallint not null default 0 check (completion_percentage between 0 and 100),
  submitted_at timestamptz,
  completed_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  quality_rating numeric(4,2) check (quality_rating is null or quality_rating > 0),
  supervisor_feedback text,
  evidence_notes text,
  blocker_reason text,
  delay_cause public.delay_cause not null default 'none',
  cancelled_reason text,
  recurrence public.recurrence_rule not null default 'none',
  recurrence_end_date date,
  recurrence_source_id uuid references public.tasks(id) on delete set null,
  overdue_notified_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_dates check (due_date >= start_date),
  constraint tasks_completed_consistency check (
    (status = 'completed' and completed_at is not null and completion_percentage = 100)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint tasks_not_own_parent check (parent_task_id is null or parent_task_id <> id)
);

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 5000),
  comment_type text not null default 'comment'
    check (comment_type in ('comment', 'progress', 'blocker', 'feedback', 'submission', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  file_name text not null check (length(file_name) between 1 and 255),
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  is_evidence boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.task_activity_logs (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  field text,
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz not null default now()
);

create table public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_id uuid not null references public.tasks(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  constraint task_dependencies_not_self check (task_id <> depends_on_id)
);

-- ---------- Daily planner ----------
create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_date date not null,
  notes text,
  obstacles text,
  assistance_needed boolean not null default false,
  assistance_details text,
  submitted_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.daily_plans(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  title text not null check (length(trim(title)) between 2 and 200),
  expected_deliverable text,
  estimated_hours numeric(5,2) check (estimated_hours is null or estimated_hours between 0 and 24),
  actual_hours numeric(5,2) check (actual_hours is null or actual_hours between 0 and 24),
  status public.plan_item_status not null default 'planned',
  obstacle text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Performance ----------
create table public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  period_type public.review_period not null,
  period_start date not null,
  period_end date not null,
  eligible_tasks int not null default 0,
  completed_tasks int not null default 0,
  on_time_tasks int not null default 0,
  late_tasks int not null default 0,
  excluded_tasks int not null default 0,
  completion_rate numeric(5,2),
  on_time_rate numeric(5,2),
  quality_score numeric(5,2),
  effort_hours numeric(8,2) not null default 0,
  computed_at timestamptz not null default now(),
  unique (employee_id, period_type, period_start)
);

create table public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  period_type public.review_period not null,
  period_start date not null,
  period_end date not null,
  rating_scale smallint not null default 5 check (rating_scale between 3 and 10),
  weights jsonb not null,
  -- automatically calculated (system-owned, recomputed by trigger)
  eligible_tasks int not null default 0,
  completed_tasks int not null default 0,
  completion_rate numeric(5,2),
  on_time_rate numeric(5,2),
  task_quality_score numeric(5,2),
  -- manager evaluations (on rating_scale)
  quality_rating numeric(4,2),
  ownership_rating numeric(4,2),
  communication_rating numeric(4,2),
  -- results
  overall_score numeric(5,2),
  category text,
  is_provisional boolean not null default true,
  data_warnings text[] not null default '{}',
  strengths text,
  improvements text,
  manager_comments text,
  action_plan text,
  status public.review_status not null default 'draft',
  finalized_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, period_type, period_start),
  constraint reviews_period check (period_end >= period_start),
  constraint reviews_not_self check (reviewer_id is null or reviewer_id <> employee_id)
);

-- ---------- Notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  task_id uuid references public.tasks(id) on delete cascade,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  disabled_types text[] not null default '{}',
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------- Workload snapshots ----------
create table public.workload_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  record_date date not null,
  active_tasks int not null,
  high_priority_tasks int not null,
  overdue_tasks int not null,
  remaining_hours numeric(8,2) not null,
  capacity_hours numeric(8,2) not null,
  utilization numeric(6,2),
  category text not null,
  created_at timestamptz not null default now(),
  unique (user_id, record_date)
);

-- ---------- Settings & audit ----------
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array['departments','profiles','teams','categories','projects','project_milestones','tasks',
                           'task_comments','daily_plans','daily_plan_items','performance_reviews']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
end $$;

-- ---------- Indexes ----------
create index profiles_department_idx on public.profiles(department_id);
create index profiles_team_idx on public.profiles(team_id);
create index profiles_manager_idx on public.profiles(manager_id);
create index teams_lead_idx on public.teams(lead_id);
create index projects_owner_idx on public.projects(owner_id);
create index projects_status_idx on public.projects(status);
create index project_members_user_idx on public.project_members(user_id);
create index milestones_project_idx on public.project_milestones(project_id, due_date);
create index tasks_status_due_idx on public.tasks(status, due_date);
create index tasks_due_idx on public.tasks(due_date);
create index tasks_project_idx on public.tasks(project_id);
create index tasks_department_idx on public.tasks(department_id);
create index tasks_category_idx on public.tasks(category_id);
create index tasks_parent_idx on public.tasks(parent_task_id);
create index tasks_assigned_by_idx on public.tasks(assigned_by);
create index tasks_completed_at_idx on public.tasks(completed_at);
create index task_assignees_user_idx on public.task_assignees(user_id);
create index task_comments_task_idx on public.task_comments(task_id, created_at);
create index task_attachments_task_idx on public.task_attachments(task_id);
create index task_activity_task_idx on public.task_activity_logs(task_id, created_at);
create index task_dependencies_dep_idx on public.task_dependencies(depends_on_id);
create index daily_plans_date_idx on public.daily_plans(plan_date);
create index daily_plan_items_plan_idx on public.daily_plan_items(plan_id);
create index daily_plan_items_task_idx on public.daily_plan_items(task_id);
create index reviews_employee_idx on public.performance_reviews(employee_id, period_start);
create index metrics_employee_idx on public.performance_metrics(employee_id, period_start);
create index notifications_user_idx on public.notifications(user_id, is_read, created_at desc);
create index notifications_task_idx on public.notifications(task_id);
create index workload_user_date_idx on public.workload_records(user_id, record_date);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

-- >>>>>>>>>> 20261101000200_security.sql
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

-- >>>>>>>>>> 20261101000300_task_workflow.sql
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

-- >>>>>>>>>> 20261101000400_analytics.sql
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

-- >>>>>>>>>> 20261101000500_storage_realtime_cron.sql
-- =====================================================================
-- Migration 5/6: private file storage, realtime, scheduled jobs
-- =====================================================================

-- ---------- Private bucket for task attachments (10 MB per file) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object path convention: <task_id>/<random>-<file name>
create policy "task files: read if task visible" on storage.objects for select to authenticated
  using (bucket_id = 'task-attachments' and public.can_view_task(public.try_uuid((storage.foldername(name))[1])));
create policy "task files: upload if task visible" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-attachments' and public.can_view_task(public.try_uuid((storage.foldername(name))[1])));
create policy "task files: delete own or as manager" on storage.objects for delete to authenticated
  using (bucket_id = 'task-attachments' and (owner = auth.uid()
         or public.can_manage_task(public.try_uuid((storage.foldername(name))[1]))));

-- ---------- Realtime: live notification bell ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------- Scheduled jobs (pg_cron is available on the Supabase Free plan) ----------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('hrp-deadline-checks', '15 * * * *', 'select public.run_deadline_checks()');
    perform cron.schedule('hrp-workload-snapshot', '30 23 * * *', 'select public.record_workload_snapshot()');
    perform cron.schedule('hrp-monthly-metrics', '0 2 1 * *',
      $job$select public.refresh_performance_metrics('monthly',
             (date_trunc('month', public.app_today()) - interval '1 month')::date,
             (date_trunc('month', public.app_today()) - interval '1 day')::date)$job$);
  else
    raise notice 'pg_cron not available – enable it in Database > Extensions, or rely on the app/Vercel daily cron.';
  end if;
end $$;

-- >>>>>>>>>> 20261101000600_reference_data_and_demo.sql
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

-- >>>>>>>>>> 20261101000700_hardening.sql
-- =====================================================================
-- Migration 7/7: function privilege hardening
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Lock everything down to
-- signed-in users, then remove internal helpers from the public API surface entirely.
-- =====================================================================
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Internal helpers: only callable from other SECURITY DEFINER functions / triggers.
revoke execute on function
  public.notify(uuid, text, text, text, text, uuid),
  public.notify_task_assignees(uuid, text, text, text, uuid),
  public.notify_task_supervisors(uuid, text, text, text),
  public.task_supervisors(uuid),
  public.log_task_activity(uuid, text, text, text, text, text),
  public.assert_can_manage_task(uuid),
  public.assert_assignees_allowed(uuid[]),
  public.spawn_next_recurrence(uuid),
  public.seed_demo_data(),
  public.clear_demo_data(),
  public.promote_to_admin(text)
from authenticated;

grant execute on function public.seed_demo_data(), public.clear_demo_data() to service_role;

-- Future functions created by migrations are not executable by anonymous visitors.
alter default privileges in schema public revoke execute on functions from public, anon;
