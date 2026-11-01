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
