import type { DelayCause, EffectiveStatus, PlanItemStatus, Priority, ProjectStatus, Recurrence, Role, EmploymentStatus } from "./types";

export const APP_NAME = "HR Performance Hub";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator / HR Manager",
  team_lead: "Team Lead / Supervisor",
  employee: "Employee",
};

export const ROLE_SHORT: Record<Role, string> = { admin: "Admin", team_lead: "Team Lead", employee: "Employee" };

export const STATUS_LABELS: Record<EffectiveStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  under_review: "Under Review",
  blocked: "Blocked",
  completed: "Completed",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

/** Tailwind classes for status chips (light background, readable text). */
export const STATUS_STYLES: Record<EffectiveStatus, string> = {
  not_started: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  under_review: "bg-violet-50 text-violet-700 border-violet-200",
  blocked: "bg-amber-50 text-amber-800 border-amber-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

export const STATUS_COLORS: Record<EffectiveStatus, string> = {
  not_started: "#64748b",
  in_progress: "#2563eb",
  under_review: "#7c3aed",
  blocked: "#d97706",
  completed: "#16a34a",
  overdue: "#dc2626",
  cancelled: "#94a3b8",
};

export const STATUS_ORDER: EffectiveStatus[] = ["not_started", "in_progress", "blocked", "under_review", "overdue", "completed", "cancelled"];

export const PRIORITY_LABELS: Record<Priority, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
export const PRIORITY_STYLES: Record<Priority, string> = {
  critical: "bg-red-600 text-white border-red-600",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  medium: "bg-sky-50 text-sky-700 border-sky-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};
export const PRIORITY_COLORS: Record<Priority, string> = { critical: "#dc2626", high: "#ea580c", medium: "#0284c7", low: "#94a3b8" };
export const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low"];

export const COMPLEXITY_LABELS: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High" };

export const DELAY_CAUSE_LABELS: Record<DelayCause, string> = {
  none: "Not classified",
  employee: "Employee-caused",
  external: "External dependency",
  management: "Management / approval delay",
};

export const RECURRENCE_LABELS: Record<Recurrence, string> = { none: "Does not repeat", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning", active: "Active", on_hold: "On Hold", completed: "Completed", cancelled: "Cancelled",
};
export const PROJECT_STATUS_STYLES: Record<ProjectStatus, string> = {
  planning: "bg-slate-100 text-slate-700 border-slate-200",
  active: "bg-blue-50 text-blue-700 border-blue-200",
  on_hold: "bg-amber-50 text-amber-800 border-amber-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

export const PLAN_STATUS_LABELS: Record<PlanItemStatus, string> = { planned: "Planned", completed: "Completed", pending: "Pending", blocked: "Blocked" };

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: "Active", probation: "Probation", on_leave: "On Leave", resigned: "Resigned", terminated: "Terminated",
};

export const WORKLOAD_STYLES: Record<string, string> = {
  Underutilized: "bg-sky-50 text-sky-700 border-sky-200",
  Balanced: "bg-green-50 text-green-700 border-green-200",
  "High Workload": "bg-amber-50 text-amber-800 border-amber-200",
  Overloaded: "bg-red-50 text-red-700 border-red-200",
  "No capacity": "bg-slate-100 text-slate-600 border-slate-200",
};

export const PERFORMANCE_STYLES: Record<string, string> = {
  Excellent: "bg-green-600 text-white border-green-600",
  "Very Good": "bg-green-50 text-green-700 border-green-200",
  Good: "bg-blue-50 text-blue-700 border-blue-200",
  "Needs Improvement": "bg-amber-50 text-amber-800 border-amber-200",
  Unsatisfactory: "bg-red-50 text-red-700 border-red-200",
  "Insufficient data": "bg-slate-100 text-slate-600 border-slate-200",
};

export const ACTIVITY_LABELS: Record<string, string> = {
  created: "created the task",
  field_changed: "changed",
  assignee_added: "assigned",
  assignee_removed: "unassigned",
  approved: "approved the task",
  changes_requested: "requested changes",
  reopened: "reopened the task",
  deadline_changed: "changed the deadline",
  cancelled: "cancelled the task",
  escalated: "escalated the task",
  became_overdue: "Task became overdue",
  comment_comment: "commented",
  comment_progress: "posted a progress update",
  comment_blocker: "reported a blocker",
  comment_feedback: "gave feedback",
  comment_submission: "submitted for review",
  attachment_added: "attached",
  attachment_removed: "removed attachment",
  dependency_added: "added dependency on",
  dependency_removed: "removed dependency on",
};

export const NOTIFICATION_TYPES: { type: string; label: string }[] = [
  { type: "task_assigned", label: "New task assigned to me" },
  { type: "deadline_approaching", label: "Deadline approaching / due today" },
  { type: "task_overdue", label: "Task became overdue" },
  { type: "task_submitted", label: "Task submitted for my review" },
  { type: "changes_requested", label: "Manager requested changes" },
  { type: "task_approved", label: "Task approved" },
  { type: "task_reassigned", label: "Task reassigned" },
  { type: "deadline_changed", label: "Deadline changed" },
  { type: "task_blocked", label: "Task blocked" },
  { type: "task_comment", label: "Comments on my tasks" },
  { type: "priority_changed", label: "Priority changed" },
  { type: "task_reopened", label: "Task reopened" },
  { type: "task_cancelled", label: "Task cancelled" },
  { type: "task_escalated", label: "Escalations" },
  { type: "milestone_delayed", label: "Delayed project milestones" },
  { type: "review_finalized", label: "Performance review published" },
];

export const PAGE_SIZE = 20;
