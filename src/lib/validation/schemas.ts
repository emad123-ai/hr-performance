import { z } from "zod";
import { isISODate } from "../domain/dates";

const isoDate = z.string().refine((v) => isISODate(v), "Enter a valid date (YYYY-MM-DD)");
// Optional fields accept "", null or undefined (HTML forms send "", parsed output uses null) and normalise to null,
// so the same schema validates both raw form input (client) and re-validates on the server.
const optionalIsoDate = z.union([z.literal(""), isoDate]).nullish().transform((v) => (v ? v : null));
const optionalUuid = z.union([z.literal(""), z.string().uuid()]).nullish().transform((v) => (v ? v : null));
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const optionalNumber = (min: number, max: number) =>
  z.union([z.literal(""), z.null(), z.coerce.number().min(min).max(max)]).optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v));

export const priorityEnum = z.enum(["critical", "high", "medium", "low"]);
export const roleEnum = z.enum(["admin", "team_lead", "employee"]);

// ---------- Tasks ----------
export const taskSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
    description: optionalText(5000),
    department_id: optionalUuid,
    project_id: optionalUuid,
    milestone_id: optionalUuid,
    category_id: optionalUuid,
    parent_task_id: optionalUuid,
    assignee_ids: z.array(z.string().uuid()).min(1, "Select at least one assignee"),
    assignment_mode: z.enum(["shared", "individual"]).default("shared"),
    start_date: isoDate,
    due_date: isoDate,
    priority: priorityEnum,
    complexity: z.coerce.number().int().min(1).max(3),
    estimated_hours: optionalNumber(0, 2000),
    recurrence: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
    recurrence_end_date: optionalIsoDate,
    depends_on: z.array(z.string().uuid()).default([]),
  })
  .refine((v) => v.due_date >= v.start_date, { message: "Due date cannot be before the start date", path: ["due_date"] })
  .refine((v) => v.recurrence === "none" || !v.recurrence_end_date || v.recurrence_end_date >= v.due_date, {
    message: "Repeat-until date must be after the first due date",
    path: ["recurrence_end_date"],
  });
export type TaskInput = z.input<typeof taskSchema>;

export const taskEditSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: optionalText(5000),
  department_id: optionalUuid,
  project_id: optionalUuid,
  category_id: optionalUuid,
  priority: priorityEnum,
  complexity: z.coerce.number().int().min(1).max(3),
  estimated_hours: optionalNumber(0, 2000),
  start_date: isoDate,
});

export const progressSchema = z
  .object({
    percentage: z.coerce.number().int().min(0).max(100),
    status: z.enum(["not_started", "in_progress", "blocked"]),
    note: optionalText(2000),
    hours_spent: optionalNumber(0, 24),
  })
  .refine((v) => v.status !== "blocked" || !!v.note, { message: "Describe the blocker", path: ["note"] });

export const reasonSchema = z.object({ reason: z.string().trim().min(3, "Please give a reason (min 3 characters)").max(1000) });

export const deadlineSchema = z.object({
  due_date: isoDate,
  reason: z.string().trim().min(3, "Please give a reason").max(1000),
  cause: z.enum(["none", "employee", "external", "management"]),
});

export const reviewDecisionSchema = z
  .object({
    decision: z.enum(["approve", "request_changes"]),
    quality: optionalNumber(1, 10),
    feedback: optionalText(2000),
  })
  .refine((v) => v.decision !== "approve" || v.quality !== null, { message: "Quality rating is required", path: ["quality"] })
  .refine((v) => v.decision !== "request_changes" || !!v.feedback, { message: "Feedback is required", path: ["feedback"] });

export const commentSchema = z.object({ body: z.string().trim().min(1, "Comment cannot be empty").max(5000) });

// ---------- Employees ----------
export const employeeSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail address"),
  employee_code: optionalText(30),
  phone: optionalText(30),
  designation: optionalText(100),
  department_id: optionalUuid,
  team_id: optionalUuid,
  manager_id: optionalUuid,
  role: roleEnum,
  employment_status: z.enum(["active", "probation", "on_leave", "resigned", "terminated"]),
  joining_date: optionalIsoDate,
  weekly_capacity_hours: optionalNumber(0, 80),
});

export const newEmployeeSchema = employeeSchema.extend({
  password: z.string().min(10, "Temporary password must be at least 10 characters").max(72)
    .regex(/[A-Za-z]/, "Include letters").regex(/\d/, "Include numbers"),
});

// ---------- Projects ----------
export const projectSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    description: optionalText(5000),
    owner_id: optionalUuid,
    department_id: optionalUuid,
    start_date: optionalIsoDate,
    target_date: optionalIsoDate,
    status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]),
    priority: priorityEnum,
    remarks: optionalText(2000),
    member_ids: z.array(z.string().uuid()).default([]),
  })
  .refine((v) => !v.start_date || !v.target_date || v.target_date >= v.start_date, {
    message: "Target date cannot be before the start date",
    path: ["target_date"],
  });

export const milestoneSchema = z.object({
  title: z.string().trim().min(2).max(150),
  description: optionalText(1000),
  due_date: isoDate,
});

// ---------- Daily planner ----------
export const planItemSchema = z.object({
  title: z.string().trim().min(2, "Describe the activity").max(200),
  task_id: optionalUuid,
  expected_deliverable: optionalText(500),
  estimated_hours: optionalNumber(0, 24),
  actual_hours: optionalNumber(0, 24),
  status: z.enum(["planned", "completed", "pending", "blocked"]),
  obstacle: optionalText(1000),
});

export const planSchema = z.object({
  plan_date: isoDate,
  notes: optionalText(2000),
  obstacles: optionalText(2000),
  assistance_needed: z.boolean().default(false),
  assistance_details: optionalText(2000),
});

// ---------- Performance reviews ----------
export const reviewSchema = z.object({
  employee_id: z.string().uuid(),
  period_type: z.enum(["monthly", "quarterly", "annual"]),
  period_start: isoDate,
  period_end: isoDate,
  quality_rating: optionalNumber(1, 10),
  ownership_rating: optionalNumber(1, 10),
  communication_rating: optionalNumber(1, 10),
  strengths: optionalText(3000),
  improvements: optionalText(3000),
  manager_comments: optionalText(3000),
  action_plan: optionalText(3000),
  finalize: z.boolean().default(false),
});

// ---------- Settings ----------
export const kpiWeightsSchema = z
  .object({
    completion: z.coerce.number().min(0).max(100),
    on_time: z.coerce.number().min(0).max(100),
    quality: z.coerce.number().min(0).max(100),
    ownership: z.coerce.number().min(0).max(100),
    communication: z.coerce.number().min(0).max(100),
  })
  .refine((w) => Math.abs(w.completion + w.on_time + w.quality + w.ownership + w.communication - 100) < 1e-9, {
    message: "Weights must total exactly 100",
    path: ["completion"],
  });

export const companySchema = z.object({
  name: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(2).max(60),
  fiscal_year_start_month: z.coerce.number().int().min(1).max(12),
  logo_url: z.union([z.literal(""), z.string().url()]).optional().transform((v) => v || null),
});

export const workingTimeSchema = z.object({
  working_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Select at least one working day"),
  hours_per_day: z.coerce.number().min(1).max(24),
});

export const workloadSettingsSchema = z
  .object({
    horizon_days: z.coerce.number().int().min(5).max(60),
    underutilized_below: z.coerce.number().min(0).max(200),
    balanced_up_to: z.coerce.number().min(0).max(300),
    high_up_to: z.coerce.number().min(0).max(400),
  })
  .refine((v) => v.underutilized_below < v.balanced_up_to && v.balanced_up_to < v.high_up_to, {
    message: "Thresholds must increase: underutilized < balanced < high",
    path: ["balanced_up_to"],
  });

export const evaluationSchema = z.object({
  max: z.coerce.number().int().min(3).max(10),
  min_tasks_for_evaluation: z.coerce.number().int().min(1).max(50),
  default_estimated_hours: z.coerce.number().min(0.5).max(100),
});

export const reminderSchema = z.object({
  days_before_due: z.array(z.coerce.number().int().min(0).max(30)).min(1),
  notify_overdue: z.boolean(),
  notify_milestones: z.boolean(),
});

export const departmentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: optionalText(20),
  description: optionalText(500),
  head_id: optionalUuid,
});

export const teamSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: optionalText(500),
  department_id: optionalUuid,
  lead_id: optionalUuid,
});

export const categorySchema = z.object({
  group_name: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(80),
  description: optionalText(500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #2563eb"),
});

/** Flattens zod issues into a field → messages map for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
