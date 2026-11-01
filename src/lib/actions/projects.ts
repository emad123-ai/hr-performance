"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import { fieldErrors, milestoneSchema, projectSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/lib/types";

const uuid = z.string().uuid();

async function syncMembers(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string, memberIds: string[]) {
  const { data: current } = await supabase.from("project_members").select("user_id").eq("project_id", projectId);
  const have = new Set((current ?? []).map((m) => m.user_id as string));
  const want = new Set(memberIds);
  const toAdd = memberIds.filter((m) => !have.has(m)).map((user_id) => ({ project_id: projectId, user_id }));
  const toRemove = [...have].filter((m) => !want.has(m));
  if (toAdd.length) {
    const { error } = await supabase.from("project_members").insert(toAdd);
    if (error) return error;
  }
  if (toRemove.length) {
    const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).in("user_id", toRemove);
    if (error) return error;
  }
  return null;
}

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const { member_ids, ...v } = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("projects")
    .insert({ ...v, created_by: auth.user?.id, completed_at: v.status === "completed" ? new Date().toISOString() : null })
    .select("id").single();
  if (error) return { ok: false, error: friendlyError(error) };
  const mErr = await syncMembers(supabase, data.id, member_ids);
  if (mErr) return { ok: false, error: `Project created, but members could not be saved: ${friendlyError(mErr)}` };
  revalidatePath("/projects");
  return { ok: true, data: { id: data.id }, message: "Project created" };
}

export async function updateProject(id: string, input: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid project" };
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const { member_ids, ...v } = parsed.data;
  const supabase = await createClient();
  const { data: existing } = await supabase.from("projects").select("status, completed_at").eq("id", id).maybeSingle();
  const completed_at = v.status === "completed" ? existing?.completed_at ?? new Date().toISOString() : null;
  const { data, error } = await supabase.from("projects").update({ ...v, completed_at }).eq("id", id).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "Only the project owner or an administrator can edit this project." };
  const mErr = await syncMembers(supabase, id, member_ids);
  if (mErr) return { ok: false, error: friendlyError(mErr) };
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { ok: true, message: "Project updated" };
}

export async function addMilestone(projectId: string, input: unknown): Promise<ActionResult> {
  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("project_milestones").insert({ ...parsed.data, project_id: projectId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, message: "Milestone added" };
}

export async function setMilestoneStatus(milestoneId: string, done: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_milestones")
    .update({ status: done ? "completed" : "pending", completed_at: done ? new Date().toISOString() : null })
    .eq("id", milestoneId).select("project_id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "You do not have permission to update this milestone." };
  revalidatePath(`/projects/${data[0].project_id}`);
  return { ok: true, message: done ? "Milestone completed" : "Milestone reopened" };
}

export async function deleteMilestone(milestoneId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_milestones").delete().eq("id", milestoneId).select("project_id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "You do not have permission to delete this milestone." };
  revalidatePath(`/projects/${data[0].project_id}`);
  return { ok: true, message: "Milestone deleted" };
}
