import "server-only";
import { createClient } from "@/lib/supabase/server";
import { summarizePlan } from "@/lib/domain/planner";
import { STATUS_LABELS, PRIORITY_LABELS, DELAY_CAUSE_LABELS, PROJECT_STATUS_LABELS, ROLE_SHORT } from "@/lib/constants";
import type {
  DailyPlan, DailyPlanItem, EmployeeDirectoryRow, ProjectOverview, TaskOverview, TeamPerformanceRow, WorkloadRow,
} from "@/lib/types";

export type ColumnFormat = "text" | "date" | "datetime" | "pct" | "hours" | "number";
export interface ReportColumn { key: string; header: string; format?: ColumnFormat }
export interface ReportResult { columns: ReportColumn[]; rows: Record<string, unknown>[]; note?: string }
export interface ReportContext { from: string; to: string; department: string | null; employee: string | null; today: string }

type Supa = Awaited<ReturnType<typeof createClient>>;

export interface ReportDef {
  slug: string;
  title: string;
  description: string;
  defaultPreset?: string;
  needsEmployee?: boolean;
  usesPeriod?: boolean;
  run: (s: Supa, c: ReportContext) => Promise<ReportResult>;
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

const taskColumns: ReportColumn[] = [
  { key: "task_code", header: "Task ID" },
  { key: "title", header: "Title" },
  { key: "assignees", header: "Assigned to" },
  { key: "assigned_by_name", header: "Assigned by" },
  { key: "department_name", header: "Department" },
  { key: "project_name", header: "Project" },
  { key: "category", header: "Category" },
  { key: "priority_label", header: "Priority" },
  { key: "status_label", header: "Status" },
  { key: "completion_percentage", header: "Progress %", format: "number" },
  { key: "start_date", header: "Start", format: "date" },
  { key: "due_date", header: "Due", format: "date" },
  { key: "original_due_date", header: "Original due", format: "date" },
];

function taskRow(t: TaskOverview) {
  return {
    ...t,
    assignees: t.assignee_names.join("; "),
    category: t.category_name ? `${t.category_group} / ${t.category_name}` : "",
    priority_label: PRIORITY_LABELS[t.priority],
    status_label: STATUS_LABELS[t.effective_status],
    delay_label: DELAY_CAUSE_LABELS[t.delay_cause],
    on_time: t.status === "completed" ? (t.completed_on_time ? "Yes" : "No") : "",
  };
}


export const REPORTS: ReportDef[] = [
  {
    slug: "daily-activity",
    title: "Daily Employee Activity Report",
    description: "Planned vs completed activities, hours and obstacles from the daily planner.",
    defaultPreset: "last_7",
    usesPeriod: true,
    async run(s, c) {
      let q = s.from("daily_plans").select("*, items:daily_plan_items(*), person:profiles(full_name, department_id)")
        .gte("plan_date", c.from).lte("plan_date", c.to).order("plan_date", { ascending: false });
      if (c.employee) q = q.eq("user_id", c.employee);
      const plans = must(await q) as (DailyPlan & { items: DailyPlanItem[]; person: { full_name: string; department_id: string | null } | null })[];
      const rows = plans
        .filter((p) => !c.department || p.person?.department_id === c.department)
        .map((p) => {
          const sm = summarizePlan(p.items);
          return {
            plan_date: p.plan_date, employee: p.person?.full_name, planned: sm.planned, completed: sm.completed, pending: sm.pending,
            blocked: sm.blocked, estimated: sm.estimatedHours, actual: sm.actualHours, completion: sm.completionPct,
            obstacles: p.obstacles ?? "", assistance: p.assistance_needed ? p.assistance_details ?? "Yes" : "", submitted: p.submitted_at ? "Yes" : "No",
          };
        });
      return {
        columns: [
          { key: "plan_date", header: "Date", format: "date" }, { key: "employee", header: "Employee" },
          { key: "planned", header: "Planned", format: "number" }, { key: "completed", header: "Completed", format: "number" },
          { key: "pending", header: "Pending", format: "number" }, { key: "blocked", header: "Blocked", format: "number" },
          { key: "estimated", header: "Est. hours", format: "hours" }, { key: "actual", header: "Actual hours", format: "hours" },
          { key: "completion", header: "Completion", format: "pct" }, { key: "submitted", header: "Submitted" },
          { key: "obstacles", header: "Obstacles" }, { key: "assistance", header: "Assistance requested" },
        ],
        rows,
      };
    },
  },
  {
    slug: "weekly-team-performance",
    title: "Weekly Team Performance Report",
    description: "Completion, on-time delivery and quality per person for tasks due in the week.",
    defaultPreset: "this_week",
    usesPeriod: true,
    run: (s, c) => teamPerformance(s, c),
  },
  {
    slug: "monthly-employee-performance",
    title: "Monthly Employee Performance Report",
    description: "Monthly KPIs with indicative and finalized review scores.",
    defaultPreset: "last_month",
    usesPeriod: true,
    run: (s, c) => teamPerformance(s, c, true),
  },
  {
    slug: "overdue",
    title: "Overdue Task Report",
    description: "All open tasks past their due date, with days overdue and delay classification.",
    async run(s, c) {
      let q = s.from("task_overview").select("*").eq("is_overdue", true).order("due_date");
      if (c.department) q = q.eq("department_id", c.department);
      if (c.employee) q = q.contains("assignee_ids", [c.employee]);
      const rows = (must(await q) as TaskOverview[]).map(taskRow);
      return { columns: [...taskColumns, { key: "days_overdue", header: "Days overdue", format: "number" }, { key: "delay_label", header: "Delay cause" }, { key: "blocker_reason", header: "Blocker" }], rows };
    },
  },
  {
    slug: "task-completion",
    title: "Task Completion Report",
    description: "Tasks approved in the period with on-time result, effort and quality rating.",
    usesPeriod: true,
    async run(s, c) {
      let q = s.from("task_overview").select("*").eq("status", "completed").gte("completed_at", `${c.from}T00:00:00`).lte("completed_at", `${c.to}T23:59:59`).order("completed_at", { ascending: false });
      if (c.department) q = q.eq("department_id", c.department);
      if (c.employee) q = q.contains("assignee_ids", [c.employee]);
      const rows = (must(await q) as TaskOverview[]).map(taskRow);
      const onTime = rows.filter((r) => r.on_time === "Yes").length;
      return {
        columns: [...taskColumns.filter((x) => x.key !== "status_label"), { key: "completed_at", header: "Completed", format: "datetime" }, { key: "on_time", header: "On time" },
          { key: "estimated_hours", header: "Est. hours", format: "hours" }, { key: "actual_hours", header: "Actual hours", format: "hours" }, { key: "quality_rating", header: "Quality", format: "number" }],
        rows,
        note: rows.length ? `${rows.length} task(s) completed · ${Math.round((onTime / rows.length) * 100)}% on time` : undefined,
      };
    },
  },
  {
    slug: "workload",
    title: "Employee Workload Report",
    description: "Active tasks, remaining effort, capacity and utilisation per employee.",
    async run(s, c) {
      const rows = must(await s.rpc("workload_overview", { p_horizon_days: null, p_department: c.department })) as WorkloadRow[];
      return {
        columns: [
          { key: "full_name", header: "Employee" }, { key: "department_name", header: "Department" }, { key: "active_tasks", header: "Active", format: "number" },
          { key: "pending_tasks", header: "Pending", format: "number" }, { key: "high_priority_tasks", header: "High priority", format: "number" },
          { key: "overdue_tasks", header: "Overdue", format: "number" }, { key: "remaining_hours", header: "Remaining est.", format: "hours" },
          { key: "actual_hours_30d", header: "Actual (30d)", format: "hours" }, { key: "capacity_hours", header: "Capacity", format: "hours" },
          { key: "available_hours", header: "Available", format: "hours" }, { key: "utilization", header: "Utilisation", format: "pct" }, { key: "category", header: "Category" },
        ],
        rows: rows.filter((r) => !c.employee || r.user_id === c.employee) as unknown as Record<string, unknown>[],
      };
    },
  },
  {
    slug: "project-progress",
    title: "Project Progress Report",
    description: "Progress, tasks, milestones and delays for every project.",
    async run(s, c) {
      let q = s.from("project_overview").select("*").order("target_date", { nullsFirst: false });
      if (c.department) q = q.eq("department_id", c.department);
      const rows = (must(await q) as ProjectOverview[]).map((p) => ({ ...p, status_label: PROJECT_STATUS_LABELS[p.status], priority_label: PRIORITY_LABELS[p.priority], delayed: p.is_delayed ? "Yes" : "No" }));
      return {
        columns: [
          { key: "project_code", header: "Project ID" }, { key: "name", header: "Project" }, { key: "owner_name", header: "Owner" }, { key: "department_name", header: "Department" },
          { key: "status_label", header: "Status" }, { key: "priority_label", header: "Priority" }, { key: "start_date", header: "Start", format: "date" },
          { key: "target_date", header: "Target", format: "date" }, { key: "progress", header: "Progress", format: "pct" },
          { key: "completed_tasks", header: "Done", format: "number" }, { key: "total_tasks", header: "Tasks", format: "number" },
          { key: "overdue_tasks", header: "Overdue", format: "number" }, { key: "milestones_completed", header: "Milestones done", format: "number" },
          { key: "milestones_delayed", header: "Milestones delayed", format: "number" }, { key: "delayed", header: "Past target" },
        ],
        rows,
      };
    },
  },
  {
    slug: "department-performance",
    title: "Department-wise Performance Report",
    description: "Task volume, completion and on-time rates per department for tasks due in the period.",
    usesPeriod: true,
    async run(s, c) {
      const rows = must(await s.rpc("department_performance", { p_from: c.from, p_to: c.to })) as Record<string, unknown>[];
      return {
        columns: [
          { key: "department_name", header: "Department" }, { key: "employees", header: "Employees", format: "number" },
          { key: "tasks_due", header: "Tasks due", format: "number" }, { key: "completed", header: "Completed", format: "number" },
          { key: "on_time", header: "On time", format: "number" }, { key: "overdue_open", header: "Overdue (open)", format: "number" },
          { key: "cancelled", header: "Cancelled", format: "number" }, { key: "completion_rate", header: "Completion rate", format: "pct" },
          { key: "on_time_rate", header: "On-time rate", format: "pct" }, { key: "avg_quality", header: "Avg quality", format: "number" },
        ],
        rows: rows.filter((r) => !c.department || r.department_id === c.department),
      };
    },
  },
  {
    slug: "employee-history",
    title: "Individual Employee History",
    description: "Complete task history for one employee: assignments, outcomes, delays and quality.",
    needsEmployee: true,
    usesPeriod: true,
    async run(s, c) {
      if (!c.employee) return { columns: [], rows: [], note: "Choose an employee to run this report." };
      const q = s.from("task_overview").select("*").contains("assignee_ids", [c.employee])
        .gte("due_date", c.from).lte("due_date", c.to).order("due_date", { ascending: false });
      const rows = (must(await q) as TaskOverview[]).map(taskRow);
      return {
        columns: [...taskColumns, { key: "completed_at", header: "Completed", format: "datetime" }, { key: "on_time", header: "On time" },
          { key: "quality_rating", header: "Quality", format: "number" }, { key: "delay_label", header: "Delay cause" }, { key: "supervisor_feedback", header: "Feedback" }],
        rows,
      };
    },
  },
  {
    slug: "pending-unresolved",
    title: "Pending and Unresolved Tasks Report",
    description: "Every open task – not started, in progress, blocked or awaiting review – ordered by due date.",
    async run(s, c) {
      let q = s.from("task_overview").select("*").not("status", "in", "(completed,cancelled)").order("due_date");
      if (c.department) q = q.eq("department_id", c.department);
      if (c.employee) q = q.contains("assignee_ids", [c.employee]);
      const rows = (must(await q) as TaskOverview[]).map(taskRow);
      return { columns: [...taskColumns, { key: "days_overdue", header: "Days overdue", format: "number" }, { key: "blocker_reason", header: "Blocker" }], rows };
    },
  },
];

async function teamPerformance(s: Supa, c: ReportContext, withReview = false): Promise<ReportResult> {
  const rows = (must(await s.rpc("team_performance", { p_from: c.from, p_to: c.to, p_department: c.department })) as TeamPerformanceRow[])
    .filter((r) => !c.employee || r.employee_id === c.employee)
    .map((r) => ({ ...r, indicative: r.data_sufficient ? r.indicative_score : null, sufficiency: r.data_sufficient ? "" : "Insufficient data" }));
  return {
    columns: [
      { key: "full_name", header: "Employee" }, { key: "designation", header: "Designation" }, { key: "department_name", header: "Department" },
      { key: "eligible_tasks", header: "Tasks with outcome", format: "number" }, { key: "completed_tasks", header: "Completed", format: "number" },
      { key: "on_time_tasks", header: "On time", format: "number" }, { key: "late_tasks", header: "Late", format: "number" },
      { key: "missed_tasks", header: "Missed", format: "number" }, { key: "excluded_tasks", header: "Excused", format: "number" },
      { key: "completion_rate", header: "Completion", format: "pct" }, { key: "on_time_rate", header: "On-time", format: "pct" },
      { key: "quality_score", header: "Quality", format: "pct" }, { key: "effort_hours", header: "Effort delivered", format: "hours" },
      { key: "indicative", header: "Indicative score", format: "number" }, { key: "sufficiency", header: "Data" },
      ...(withReview ? [{ key: "review_score", header: "Review score", format: "number" as const }, { key: "review_category", header: "Category" }, { key: "review_status", header: "Review status" }] : []),
    ],
    rows: rows as unknown as Record<string, unknown>[],
    note: "Scores are calculated from tasks due in the period. Cancelled tasks and delays classified as external/management are not penalised.",
  };
}

/** Employee directory export (used by the Employees page). */
export async function employeeDirectoryReport(s: Supa): Promise<ReportResult> {
  const rows = (must(await s.from("employee_directory").select("*").order("full_name")) as EmployeeDirectoryRow[])
    .map((e) => ({ ...e, role_label: ROLE_SHORT[e.role], active: e.is_active ? "Active" : "Inactive" }));
  return {
    columns: [
      { key: "employee_code", header: "Employee ID" }, { key: "full_name", header: "Full name" }, { key: "email", header: "E-mail" },
      { key: "designation", header: "Designation" }, { key: "department_name", header: "Department" }, { key: "manager_name", header: "Reporting manager" },
      { key: "joining_date", header: "Joining date", format: "date" }, { key: "employment_status", header: "Employment status" },
      { key: "active", header: "Account" }, { key: "role_label", header: "Role" }, { key: "active_tasks", header: "Active tasks", format: "number" },
      { key: "completed_tasks", header: "Completed tasks", format: "number" }, { key: "overdue_tasks", header: "Overdue tasks", format: "number" },
      { key: "latest_score", header: "Latest score", format: "number" }, { key: "latest_category", header: "Category" },
    ],
    rows,
  };
}

export function findReport(slug: string) {
  return REPORTS.find((r) => r.slug === slug) ?? null;
}
