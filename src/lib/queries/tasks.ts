import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, startOfWeek } from "@/lib/domain/dates";
import { PAGE_SIZE } from "@/lib/constants";
import { ilikeTerm, isUuid, sp, spPage, spSort, type SearchParams } from "@/lib/search-params";
import type { TaskOverview } from "@/lib/types";

export const TASK_SORTS = ["task_code", "title", "due_date", "priority", "status", "completion_percentage", "assigned_at"] as const;
const STATUSES = ["not_started", "in_progress", "under_review", "blocked", "completed", "overdue", "cancelled"];
const PRIORITIES = ["critical", "high", "medium", "low"];

export interface TaskQuery {
  scope: "my" | "team";
  userId: string;
  today: string;
  params: SearchParams;
  paginate?: boolean;
  limit?: number;
}

/** Filtered, sorted, paginated task list from the task_overview view (RLS applies). */
export async function listTasks({ scope, userId, today, params, paginate = true, limit = 500 }: TaskQuery) {
  const supabase = await createClient();
  const { sort, ascending } = spSort(params, TASK_SORTS, "due_date", "asc");
  const page = spPage(params);
  let q = supabase.from("task_overview").select("*", { count: "exact" });

  if (scope === "my") q = q.contains("assignee_ids", [userId]);

  const search = sp(params, "q");
  if (search) q = q.or(`title.ilike.${ilikeTerm(search)},task_code.ilike.${ilikeTerm(search)}`);

  const status = sp(params, "status");
  if (status && STATUSES.includes(status)) q = q.eq("effective_status", status);
  else if (status === "active") q = q.in("status", ["in_progress", "under_review", "blocked"]).eq("is_overdue", false);
  else if (!sp(params, "show") && !status && sp(params, "view") !== "calendar") {
    // default: hide cancelled tasks unless explicitly requested
    q = q.neq("status", "cancelled");
  }
  const priority = sp(params, "priority");
  if (priority && PRIORITIES.includes(priority)) q = q.eq("priority", priority);
  const assignee = sp(params, "assignee");
  if (isUuid(assignee)) q = q.contains("assignee_ids", [assignee]);
  const project = sp(params, "project");
  if (isUuid(project)) q = q.eq("project_id", project);
  const department = sp(params, "department");
  if (isUuid(department)) q = q.eq("department_id", department);
  const category = sp(params, "category");
  if (isUuid(category)) q = q.eq("category_id", category);
  const assignedBy = sp(params, "assigned_by");
  if (isUuid(assignedBy)) q = q.eq("assigned_by", assignedBy);

  const due = sp(params, "due");
  const weekEnd = addDays(startOfWeek(today), 6);
  if (due === "today") q = q.eq("due_date", today).not("status", "in", "(completed,cancelled)");
  else if (due === "week") q = q.gte("due_date", today).lte("due_date", weekEnd).not("status", "in", "(completed,cancelled)");
  else if (due === "overdue") q = q.eq("is_overdue", true);
  else if (due === "open") q = q.not("status", "in", "(completed,cancelled)");

  // Period drill-downs from the dashboard KPI cards
  const dueFrom = sp(params, "due_from");
  const dueTo = sp(params, "due_to");
  if (dueFrom) q = q.gte("due_date", dueFrom);
  if (dueTo) q = q.lte("due_date", dueTo);
  const doneFrom = sp(params, "completed_from");
  const doneTo = sp(params, "completed_to");
  if (doneFrom) q = q.gte("completed_at", `${doneFrom}T00:00:00`);
  if (doneTo) q = q.lte("completed_at", `${doneTo}T23:59:59`);
  const assignedFrom = sp(params, "assigned_from");
  const assignedTo = sp(params, "assigned_to");
  if (assignedFrom) q = q.gte("assigned_at", `${assignedFrom}T00:00:00`);
  if (assignedTo) q = q.lte("assigned_at", `${assignedTo}T23:59:59`);

  q = q.order(sort, { ascending }).order("task_code", { ascending: true });
  q = paginate ? q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1) : q.limit(limit);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as TaskOverview[], total: count ?? 0, page, pageSize: PAGE_SIZE };
}

/** Lightweight list of open tasks for dependency / planner pickers. */
export async function openTaskOptions(onlyMine?: string) {
  const supabase = await createClient();
  let q = supabase.from("task_overview").select("id, task_code, title, assignee_ids").not("status", "in", "(completed,cancelled)").order("due_date").limit(300);
  if (onlyMine) q = q.contains("assignee_ids", [onlyMine]);
  const { data } = await q;
  return (data ?? []).map((t) => ({ id: t.id as string, label: `${t.task_code} · ${t.title}` }));
}
