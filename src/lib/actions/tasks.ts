"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import {
  commentSchema, deadlineSchema, fieldErrors, progressSchema, reasonSchema, reviewDecisionSchema, taskEditSchema, taskSchema,
} from "@/lib/validation/schemas";
import type { ActionResult, TaskStatus } from "@/lib/types";

const uuid = z.string().uuid();

function refresh(taskId?: string) {
  revalidatePath("/tasks", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/workload");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

async function rpc(fn: string, args: Record<string, unknown>, taskId?: string, message?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: friendlyError(error) };
  refresh(taskId);
  return { ok: true, message };
}

// ---------------------------------------------------------------- create / edit
export async function createTask(input: unknown): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const payload = {
    title: v.title, description: v.description, department_id: v.department_id, project_id: v.project_id,
    milestone_id: v.milestone_id, category_id: v.category_id, parent_task_id: v.parent_task_id,
    start_date: v.start_date, due_date: v.due_date, priority: v.priority, complexity: v.complexity,
    estimated_hours: v.estimated_hours, recurrence: v.recurrence, recurrence_end_date: v.recurrence_end_date,
  };
  // "shared" = one task with several assignees; "individual" = a separate copy per person (individual accountability)
  const groups = v.assignment_mode === "individual" ? v.assignee_ids.map((a) => [a]) : [v.assignee_ids];
  const ids: string[] = [];
  for (const assignees of groups) {
    const { data, error } = await supabase.rpc("create_task", { p: payload, p_assignees: assignees });
    if (error) return { ok: false, error: friendlyError(error) + (ids.length ? ` (${ids.length} task(s) were created before the error)` : "") };
    ids.push(data as string);
  }
  if (v.depends_on.length) {
    const rows = ids.flatMap((id) => v.depends_on.map((d) => ({ task_id: id, depends_on_id: d })));
    const { error } = await supabase.from("task_dependencies").insert(rows);
    if (error) return { ok: false, error: `Task created, but dependencies could not be saved: ${friendlyError(error)}` };
  }
  refresh();
  return { ok: true, data: { ids }, message: ids.length > 1 ? `${ids.length} tasks created` : "Task created" };
}

export async function updateTaskDetails(taskId: string, input: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(taskId).success) return { ok: false, error: "Invalid task" };
  const parsed = taskEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").update(parsed.data).eq("id", taskId).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "You do not have permission to edit this task." };
  refresh(taskId);
  return { ok: true, message: "Task updated" };
}

// ---------------------------------------------------------------- workflow
export async function updateProgress(taskId: string, input: unknown): Promise<ActionResult> {
  const parsed = progressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  return rpc("update_task_progress", { p_task: taskId, p_percentage: v.percentage, p_status: v.status, p_note: v.note, p_hours_spent: v.hours_spent }, taskId, "Progress updated");
}

export async function submitTask(taskId: string, note: string, evidence: string): Promise<ActionResult> {
  const n = z.string().trim().max(2000).safeParse(note);
  const e = z.string().trim().max(4000).safeParse(evidence);
  if (!n.success || !e.success) return { ok: false, error: "Text is too long" };
  return rpc("submit_task", { p_task: taskId, p_note: n.data || null, p_evidence: e.data || null }, taskId, "Submitted for review");
}

export async function reviewTask(taskId: string, input: unknown): Promise<ActionResult> {
  const parsed = reviewDecisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const res = await rpc("review_task", { p_task: taskId, p_decision: v.decision, p_quality: v.quality, p_feedback: v.feedback }, taskId,
    v.decision === "approve" ? "Task approved" : "Changes requested");
  if (res.ok) revalidatePath("/performance", "layout");
  return res;
}

export async function reopenTask(taskId: string, reason: string): Promise<ActionResult> {
  const parsed = reasonSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return rpc("reopen_task", { p_task: taskId, p_reason: parsed.data.reason }, taskId, "Task reopened");
}

export async function cancelTask(taskId: string, reason: string): Promise<ActionResult> {
  const parsed = reasonSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return rpc("cancel_task", { p_task: taskId, p_reason: parsed.data.reason }, taskId, "Task cancelled");
}

export async function changeDeadline(taskId: string, input: unknown): Promise<ActionResult> {
  const parsed = deadlineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  return rpc("change_task_deadline", { p_task: taskId, p_new_due: v.due_date, p_reason: v.reason, p_cause: v.cause }, taskId, "Deadline changed");
}

export async function setDelayCause(taskId: string, cause: string, reason: string): Promise<ActionResult> {
  const c = z.enum(["none", "employee", "external", "management"]).safeParse(cause);
  const r = reasonSchema.safeParse({ reason });
  if (!c.success || !r.success) return { ok: false, error: "Choose a cause and give a reason" };
  return rpc("set_delay_cause", { p_task: taskId, p_cause: c.data, p_reason: r.data.reason }, taskId, "Delay classification saved");
}

export async function reassignTask(taskId: string, assigneeIds: string[], reason: string): Promise<ActionResult> {
  const ids = z.array(uuid).min(1, "Select at least one person").safeParse(assigneeIds);
  const r = reasonSchema.safeParse({ reason });
  if (!ids.success) return { ok: false, error: ids.error.issues[0].message };
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  return rpc("reassign_task", { p_task: taskId, p_assignees: ids.data, p_reason: r.data.reason }, taskId, "Task reassigned");
}

export async function escalateTask(taskId: string, note: string): Promise<ActionResult> {
  const r = reasonSchema.safeParse({ reason: note });
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  return rpc("escalate_task", { p_task: taskId, p_note: r.data.reason }, taskId, "Escalated to HR management");
}

/** Kanban drag & drop for simple transitions (others open a dialog on the client). */
export async function moveTask(taskId: string, to: TaskStatus, currentPct: number): Promise<ActionResult> {
  if (to === "under_review") return submitTask(taskId, "Moved to review from the board", "");
  if (to === "not_started" || to === "in_progress") {
    return rpc("update_task_progress", { p_task: taskId, p_percentage: to === "not_started" ? 0 : Math.max(currentPct, 10), p_status: to, p_note: null, p_hours_spent: null }, taskId, "Status updated");
  }
  return { ok: false, error: "This change needs more details – open the task to continue." };
}

// ---------------------------------------------------------------- comments, files, dependencies
export async function addComment(taskId: string, body: string): Promise<ActionResult> {
  const parsed = commentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("task_comments").insert({ task_id: taskId, author_id: auth.user?.id, body: parsed.data.body, comment_type: "comment" });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true, message: "Comment added" };
}

const attachmentSchema = z.object({
  file_name: z.string().min(1).max(255),
  storage_path: z.string().min(10).max(500),
  mime_type: z.string().max(150).nullable(),
  size_bytes: z.number().int().min(0).max(10 * 1024 * 1024),
  is_evidence: z.boolean(),
});

/** Records metadata after the browser uploaded the file to the private bucket (storage policies checked the upload). */
export async function registerAttachment(taskId: string, input: unknown): Promise<ActionResult> {
  const parsed = attachmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid file details" };
  if (!parsed.data.storage_path.startsWith(`${taskId}/`)) return { ok: false, error: "Invalid storage path" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("task_attachments").insert({ ...parsed.data, task_id: taskId, uploaded_by: auth.user?.id });
  if (error) {
    await supabase.storage.from("task-attachments").remove([parsed.data.storage_path]);
    return { ok: false, error: friendlyError(error) };
  }
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true, message: "File attached" };
}

export async function deleteAttachment(attachmentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("task_attachments").select("id, task_id, storage_path").eq("id", attachmentId).maybeSingle();
  if (!row) return { ok: false, error: "Attachment not found" };
  const { data, error } = await supabase.from("task_attachments").delete().eq("id", attachmentId).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "You can only remove files you uploaded." };
  await supabase.storage.from("task-attachments").remove([row.storage_path]);
  revalidatePath(`/tasks/${row.task_id}`);
  return { ok: true, message: "Attachment removed" };
}

export async function getAttachmentUrl(storagePath: string): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("task-attachments").createSignedUrl(storagePath, 60);
  if (error || !data) return { ok: false, error: "File not available" };
  return { ok: true, data: { url: data.signedUrl } };
}

export async function addDependency(taskId: string, dependsOnId: string): Promise<ActionResult> {
  if (!uuid.safeParse(dependsOnId).success) return { ok: false, error: "Choose a task" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("task_dependencies").insert({ task_id: taskId, depends_on_id: dependsOnId, created_by: auth.user?.id });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh(taskId);
  return { ok: true, message: "Dependency added" };
}

export async function removeDependency(taskId: string, dependsOnId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("task_dependencies").delete().eq("task_id", taskId).eq("depends_on_id", dependsOnId).select("task_id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "You do not have permission to change dependencies." };
  refresh(taskId);
  return { ok: true, message: "Dependency removed" };
}
