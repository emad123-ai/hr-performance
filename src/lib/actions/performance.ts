"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import { fieldErrors, reviewSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/lib/types";

/**
 * Creates or updates a review. Only manager inputs are sent – automatic metrics, weights,
 * overall score and category are (re)calculated by the database trigger compute_review().
 */
export async function saveReview(input: unknown, reviewId?: string): Promise<ActionResult<{ id: string }>> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  if (v.period_end < v.period_start) return { ok: false, error: "Period end must be after the start" };
  const supabase = await createClient();
  const manager = {
    quality_rating: v.quality_rating, ownership_rating: v.ownership_rating, communication_rating: v.communication_rating,
    strengths: v.strengths, improvements: v.improvements, manager_comments: v.manager_comments, action_plan: v.action_plan,
    status: v.finalize ? "finalized" : "draft",
  };
  let id = reviewId;
  if (id) {
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid review" };
    const { data, error } = await supabase.from("performance_reviews").update(manager).eq("id", id).select("id");
    if (error) return { ok: false, error: friendlyError(error) };
    if (!data?.length) return { ok: false, error: "Review not found or not permitted." };
  } else {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("performance_reviews").insert({
      ...manager, employee_id: v.employee_id, reviewer_id: auth.user?.id, period_type: v.period_type,
      period_start: v.period_start, period_end: v.period_end, weights: {},
    }).select("id").single();
    if (error) {
      if (/duplicate key/i.test(error.message)) return { ok: false, error: "A review for this employee and period already exists – open it from the employee's performance page." };
      return { ok: false, error: friendlyError(error) };
    }
    id = data.id;
  }
  revalidatePath("/performance", "layout");
  revalidatePath(`/employees/${v.employee_id}`);
  return { ok: true, data: { id: id! }, message: v.finalize ? "Review finalized and shared with the employee" : "Draft saved" };
}

/** Recalculates automatic metrics on a draft from current task data (saving re-runs the trigger). */
export async function recalculateReview(reviewId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("performance_reviews").update({ updated_at: new Date().toISOString() }).eq("id", reviewId).eq("status", "draft").select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "Only draft reviews can be recalculated." };
  revalidatePath("/performance", "layout");
  return { ok: true, message: "Metrics recalculated from current task data" };
}

export async function reopenReview(reviewId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("performance_reviews").update({ status: "draft" }).eq("id", reviewId).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "Not permitted." };
  revalidatePath("/performance", "layout");
  return { ok: true, message: "Review returned to draft" };
}

export async function deleteDraftReview(reviewId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("performance_reviews").delete().eq("id", reviewId).eq("status", "draft").select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "Only draft reviews can be deleted." };
  revalidatePath("/performance", "layout");
  return { ok: true, message: "Draft deleted" };
}

export async function refreshMetrics(periodType: string, from: string, to: string): Promise<ActionResult> {
  const t = z.enum(["monthly", "quarterly", "annual"]).safeParse(periodType);
  if (!t.success) return { ok: false, error: "Invalid period" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("refresh_performance_metrics", { p_period_type: t.data, p_start: from, p_end: to });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/performance", "layout");
  return { ok: true, message: `Metrics snapshot stored for ${data} employee(s)` };
}
