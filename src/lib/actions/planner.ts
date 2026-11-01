"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import { fieldErrors, planItemSchema, planSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/lib/types";

async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

/** Gets or creates the current user's plan for a date (RLS: only own plans are writable). */
async function ensurePlan(date: string): Promise<{ id: string } | { error: string }> {
  const { supabase, userId } = await me();
  if (!userId) return { error: "Not signed in" };
  const { data: existing } = await supabase.from("daily_plans").select("id").eq("user_id", userId).eq("plan_date", date).maybeSingle();
  if (existing) return { id: existing.id };
  const { data, error } = await supabase.from("daily_plans").insert({ user_id: userId, plan_date: date }).select("id").single();
  if (error) return { error: friendlyError(error) };
  return { id: data.id };
}

export async function savePlan(input: unknown, submit = false): Promise<ActionResult> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, fieldErrors: fieldErrors(parsed.error) };
  const plan = await ensurePlan(parsed.data.plan_date);
  if ("error" in plan) return { ok: false, error: plan.error };
  const { supabase } = await me();
  const { plan_date: _date, ...rest } = parsed.data;
  void _date;
  const { error } = await supabase.from("daily_plans").update({ ...rest, ...(submit ? { submitted_at: new Date().toISOString() } : {}) }).eq("id", plan.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/planner", "layout");
  return { ok: true, message: submit ? "Daily report submitted" : "Plan saved" };
}

export async function addPlanItem(date: string, input: unknown): Promise<ActionResult> {
  const parsed = planItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, fieldErrors: fieldErrors(parsed.error) };
  const plan = await ensurePlan(date);
  if ("error" in plan) return { ok: false, error: plan.error };
  const { supabase } = await me();
  const { count } = await supabase.from("daily_plan_items").select("id", { count: "exact", head: true }).eq("plan_id", plan.id);
  const { error } = await supabase.from("daily_plan_items").insert({ ...parsed.data, plan_id: plan.id, sort_order: (count ?? 0) + 1 });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/planner", "layout");
  return { ok: true, message: "Activity added" };
}

export async function updatePlanItem(itemId: string, input: unknown): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(itemId).success) return { ok: false, error: "Invalid item" };
  const parsed = planItemSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  const { supabase } = await me();
  const { data, error } = await supabase.from("daily_plan_items").update(patch).eq("id", itemId).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "You can only edit your own plan." };
  revalidatePath("/planner", "layout");
  return { ok: true };
}

export async function deletePlanItem(itemId: string): Promise<ActionResult> {
  const { supabase } = await me();
  const { data, error } = await supabase.from("daily_plan_items").delete().eq("id", itemId).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "You can only edit your own plan." };
  revalidatePath("/planner", "layout");
  return { ok: true, message: "Activity removed" };
}

/** Copies unfinished items from the previous plan into today's plan. */
export async function carryOverPending(date: string): Promise<ActionResult> {
  const { supabase, userId } = await me();
  if (!userId) return { ok: false, error: "Not signed in" };
  const { data: prev } = await supabase.from("daily_plans").select("id, plan_date").eq("user_id", userId).lt("plan_date", date)
    .order("plan_date", { ascending: false }).limit(1).maybeSingle();
  if (!prev) return { ok: false, error: "No earlier plan found." };
  const { data: items } = await supabase.from("daily_plan_items").select("*").eq("plan_id", prev.id).in("status", ["planned", "pending", "blocked"]);
  if (!items?.length) return { ok: false, error: "Nothing pending from your last plan." };
  const plan = await ensurePlan(date);
  if ("error" in plan) return { ok: false, error: plan.error };
  const { error } = await supabase.from("daily_plan_items").insert(items.map((i, n) => ({
    plan_id: plan.id, task_id: i.task_id, title: i.title, expected_deliverable: i.expected_deliverable,
    estimated_hours: i.estimated_hours, status: "planned", obstacle: i.obstacle, sort_order: 100 + n,
  })));
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/planner", "layout");
  return { ok: true, message: `${items.length} item(s) carried over from ${prev.plan_date}` };
}
