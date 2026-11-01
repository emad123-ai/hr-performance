// UI-level permission helpers. These only decide what to SHOW; every action is
// re-checked on the server and enforced by PostgreSQL Row Level Security.
import type { EffectiveStatus, Role, TaskStatus } from "../types";

export const isManagerRole = (role: Role) => role === "admin" || role === "team_lead";

export type TaskAction =
  | "update_progress" | "submit" | "approve" | "request_changes" | "reopen" | "change_deadline"
  | "cancel" | "reassign" | "escalate" | "edit" | "classify_delay";

export interface TaskActionContext {
  role: Role;
  status: TaskStatus;
  isAssignee: boolean;
  canManage: boolean;
}

export function allowedTaskActions(ctx: TaskActionContext): TaskAction[] {
  const a: TaskAction[] = [];
  const open = ctx.status !== "completed" && ctx.status !== "cancelled";
  if (open && ctx.status !== "under_review" && (ctx.isAssignee || ctx.canManage)) a.push("update_progress");
  if (ctx.isAssignee && ["not_started", "in_progress", "blocked"].includes(ctx.status)) a.push("submit");
  if (ctx.canManage) {
    if (open) a.push("approve");
    if (ctx.status === "under_review") a.push("request_changes");
    if (!open) a.push("reopen");
    if (open) a.push("change_deadline", "cancel", "reassign", "classify_delay", "edit");
    a.push("escalate");
  }
  return a;
}

/** Which Kanban column moves are valid for the current user. */
export function kanbanTarget(column: EffectiveStatus): TaskStatus | null {
  if (column === "overdue") return null;
  return column;
}

export function canMoveOnBoard(from: TaskStatus, to: TaskStatus, ctx: { isAssignee: boolean; canManage: boolean }): boolean {
  if (from === to) return false;
  if (from === "completed" || from === "cancelled") return false; // reopen requires a reason → task page
  if (to === "cancelled") return false; // requires a reason → task page
  if (to === "completed") return ctx.canManage; // approval dialog asks for a rating
  if (to === "under_review") return ctx.isAssignee && from !== "under_review";
  if (from === "under_review") return ctx.canManage && to === "in_progress"; // request changes
  return ctx.isAssignee || ctx.canManage;
}
