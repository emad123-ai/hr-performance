// Domain types mirroring the PostgreSQL schema (supabase/migrations).
// Optionally regenerate exact types with: npx supabase gen types typescript --project-id <ref>

export type Role = "admin" | "team_lead" | "employee";
export type EmploymentStatus = "active" | "probation" | "on_leave" | "resigned" | "terminated";
export type TaskStatus = "not_started" | "in_progress" | "under_review" | "blocked" | "completed" | "cancelled";
export type EffectiveStatus = TaskStatus | "overdue";
export type Priority = "critical" | "high" | "medium" | "low";
export type DelayCause = "none" | "employee" | "external" | "management";
export type Recurrence = "none" | "daily" | "weekly" | "monthly";
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";
export type PlanItemStatus = "planned" | "completed" | "pending" | "blocked";
export type ReviewPeriod = "monthly" | "quarterly" | "annual";
export type ReviewStatus = "draft" | "finalized";

export interface Profile {
  id: string;
  employee_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  department_id: string | null;
  team_id: string | null;
  manager_id: string | null;
  role: Role;
  employment_status: EmploymentStatus;
  is_active: boolean;
  joining_date: string | null;
  weekly_capacity_hours: number | null;
  avatar_url: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface EmployeeDirectoryRow extends Profile {
  department_name: string | null;
  team_name: string | null;
  manager_name: string | null;
  active_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  latest_score: number | null;
  latest_category: string | null;
}

export interface Department {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  head_id: string | null;
  is_active: boolean;
  is_demo: boolean;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  lead_id: string | null;
}

export interface Category {
  id: string;
  group_name: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface Task {
  id: string;
  task_code: string;
  title: string;
  description: string | null;
  department_id: string | null;
  project_id: string | null;
  milestone_id: string | null;
  category_id: string | null;
  parent_task_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
  start_date: string;
  due_date: string;
  original_due_date: string | null;
  priority: Priority;
  complexity: 1 | 2 | 3;
  estimated_hours: number | null;
  actual_hours: number;
  status: TaskStatus;
  completion_percentage: number;
  submitted_at: string | null;
  completed_at: string | null;
  approved_by: string | null;
  quality_rating: number | null;
  supervisor_feedback: string | null;
  evidence_notes: string | null;
  blocker_reason: string | null;
  delay_cause: DelayCause;
  cancelled_reason: string | null;
  recurrence: Recurrence;
  recurrence_end_date: string | null;
  recurrence_source_id: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskOverview extends Task {
  is_overdue: boolean;
  effective_status: EffectiveStatus;
  days_overdue: number;
  assignee_ids: string[];
  assignee_names: string[];
  assigned_by_name: string | null;
  project_name: string | null;
  department_name: string | null;
  category_name: string | null;
  category_group: string | null;
  category_color: string | null;
  subtask_count: number;
  open_dependency_count: number;
  completed_on_time: boolean | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  comment_type: "comment" | "progress" | "blocker" | "feedback" | "submission" | "system";
  created_at: string;
  author?: { full_name: string } | null;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  uploaded_by: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  is_evidence: boolean;
  created_at: string;
  uploader?: { full_name: string } | null;
}

export interface TaskActivity {
  id: number;
  task_id: string;
  actor_id: string | null;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  created_at: string;
  actor?: { full_name: string } | null;
}

export interface Project {
  id: string;
  project_code: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  department_id: string | null;
  start_date: string | null;
  target_date: string | null;
  completed_at: string | null;
  status: ProjectStatus;
  priority: Priority;
  remarks: string | null;
  created_by: string | null;
  is_demo: boolean;
}

export interface ProjectOverview extends Project {
  owner_name: string | null;
  department_name: string | null;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  progress: number;
  member_count: number;
  milestone_count: number;
  milestones_completed: number;
  milestones_delayed: number;
  is_delayed: boolean;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string;
  status: "pending" | "completed";
  completed_at: string | null;
}

export interface DailyPlan {
  id: string;
  user_id: string;
  plan_date: string;
  notes: string | null;
  obstacles: string | null;
  assistance_needed: boolean;
  assistance_details: string | null;
  submitted_at: string | null;
}

export interface DailyPlanItem {
  id: string;
  plan_id: string;
  task_id: string | null;
  title: string;
  expected_deliverable: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  status: PlanItemStatus;
  obstacle: string | null;
  sort_order: number;
}

export interface PerformanceReview {
  id: string;
  employee_id: string;
  reviewer_id: string | null;
  period_type: ReviewPeriod;
  period_start: string;
  period_end: string;
  rating_scale: number;
  weights: KpiWeights;
  eligible_tasks: number;
  completed_tasks: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  task_quality_score: number | null;
  quality_rating: number | null;
  ownership_rating: number | null;
  communication_rating: number | null;
  overall_score: number | null;
  category: string | null;
  is_provisional: boolean;
  data_warnings: string[];
  strengths: string | null;
  improvements: string | null;
  manager_comments: string | null;
  action_plan: string | null;
  status: ReviewStatus;
  finalized_at: string | null;
  updated_at: string;
}

export interface TeamPerformanceRow {
  employee_id: string;
  full_name: string;
  employee_code: string;
  designation: string | null;
  department_id: string | null;
  department_name: string | null;
  eligible_tasks: number;
  completed_tasks: number;
  on_time_tasks: number;
  late_tasks: number;
  missed_tasks: number;
  excluded_tasks: number;
  pending_not_due: number;
  awaiting_review: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  quality_score: number | null;
  effort_hours: number;
  indicative_score: number | null;
  data_sufficient: boolean;
  review_id: string | null;
  review_score: number | null;
  review_category: string | null;
  review_status: ReviewStatus | null;
}

export interface WorkloadRow {
  user_id: string;
  full_name: string;
  employee_code: string;
  designation: string | null;
  department_id: string | null;
  department_name: string | null;
  active_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  blocked_tasks: number;
  high_priority_tasks: number;
  overdue_tasks: number;
  remaining_hours: number;
  estimated_hours_total: number;
  actual_hours_30d: number;
  capacity_hours: number;
  available_hours: number;
  utilization: number | null;
  category: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  task_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface KpiWeights {
  completion: number;
  on_time: number;
  quality: number;
  ownership: number;
  communication: number;
}

export interface DashboardData {
  kpis: {
    total_employees: number;
    assigned_in_period: number;
    due_in_period: number;
    completed_in_period: number;
    pending: number;
    in_progress: number;
    under_review: number;
    blocked: number;
    overdue: number;
    due_today: number;
    due_this_week: number;
    completion_rate: number | null;
    on_time_rate: number | null;
    avg_completion_days: number | null;
    active_projects: number;
  };
  trend: { bucket: string; completed: number; created: number; overdue: number }[];
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_department: { name: string; open: number; completed: number; overdue: number }[];
  projects: { id: string; name: string; progress: number; status: ProjectStatus; overdue: number; target_date: string | null; is_delayed: boolean }[];
  attention: { id: string; task_code: string; title: string; due_date: string; priority: Priority; effective_status: EffectiveStatus; assignees: string[] }[];
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
