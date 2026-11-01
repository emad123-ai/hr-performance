"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/errors";
import {
  categorySchema, companySchema, departmentSchema, evaluationSchema, kpiWeightsSchema, reminderSchema, teamSchema, workingTimeSchema, workloadSettingsSchema,
} from "@/lib/validation/schemas";
import type { ActionResult } from "@/lib/types";

async function adminOnly(): Promise<ActionResult | null> {
  const me = await getCurrentUser();
  return me?.role === "admin" && me.is_active ? null : { ok: false, error: "Only administrators can change settings." };
}

async function putSetting(key: string, value: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("system_settings").upsert({ key, value });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved" };
}

async function mergeSetting(key: string, patch: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await createClient();
  const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
  return putSetting(key, { ...((data?.value as object) ?? {}), ...patch });
}

const SIMPLE: Record<string, z.ZodTypeAny> = {
  company: companySchema,
  kpi_weights: kpiWeightsSchema,
  working_time: workingTimeSchema,
  workload: workloadSettingsSchema,
  reminders: reminderSchema,
};

export async function saveSetting(key: string, input: unknown): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  const schema = SIMPLE[key];
  if (!schema) return { ok: false, error: "Unknown setting" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return key === "company" ? mergeSetting(key, parsed.data) : putSetting(key, parsed.data);
}

export async function saveEvaluationSettings(input: unknown, labels: Record<string, string>): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = evaluationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const cleanLabels = Object.fromEntries(Object.entries(labels).filter(([k]) => Number(k) >= 1 && Number(k) <= parsed.data.max).map(([k, v]) => [k, String(v).slice(0, 40)]));
  const r1 = await putSetting("evaluation_scale", { max: parsed.data.max, labels: cleanLabels });
  if (!r1.ok) return r1;
  return mergeSetting("performance_rules", { min_tasks_for_evaluation: parsed.data.min_tasks_for_evaluation, default_estimated_hours: parsed.data.default_estimated_hours });
}

export async function saveBands(bands: { min: number; label: string }[]): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z.array(z.object({ min: z.coerce.number().min(0).max(100), label: z.string().trim().min(2).max(40) })).min(2).max(8).safeParse(bands);
  if (!parsed.success) return { ok: false, error: "Each band needs a label and a minimum score between 0 and 100" };
  if (!parsed.data.some((b) => b.min === 0)) return { ok: false, error: "One band must start at 0" };
  return putSetting("performance_bands", [...parsed.data].sort((a, b) => b.min - a.min));
}

export async function saveLabels(key: "priorities" | "statuses", value: Record<string, Record<string, unknown>>): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  const item = key === "priorities"
    ? z.object({ label: z.string().trim().min(2).max(30), description: z.string().max(200), target_days: z.coerce.number().int().min(0).max(365) })
    : z.object({ label: z.string().trim().min(2).max(30), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
  const parsed = z.record(item).safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return putSetting(key, parsed.data);
}

export async function saveDesignations(list: string[]): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z.array(z.string().trim().min(2).max(100)).max(100).safeParse(list.filter(Boolean));
  if (!parsed.success) return { ok: false, error: "Designations must be 2–100 characters" };
  return putSetting("designations", [...new Set(parsed.data)]);
}

// ---------- reference data (RLS: admin only) ----------
const TABLES = { departments: departmentSchema, teams: teamSchema, categories: categorySchema } as const;
type RefTable = keyof typeof TABLES;

export async function saveReference(table: RefTable, input: unknown, id?: string): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = TABLES[table].safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from(table).update(parsed.data).eq("id", id)
    : await supabase.from(table).insert(parsed.data);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/settings");
  return { ok: true, message: id ? "Updated" : "Added" };
}

export async function toggleReferenceActive(table: "departments" | "categories", id: string, active: boolean): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/settings");
  return { ok: true, message: active ? "Activated" : "Deactivated (kept for history)" };
}

export async function deleteReference(table: RefTable, id: string): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  const supabase = await createClient();
  if (table === "categories") {
    const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("category_id", id);
    if (count) return { ok: false, error: `Used by ${count} task(s). Deactivate it instead to keep history intact.` };
  }
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/settings");
  return { ok: true, message: "Deleted" };
}

// ---------- maintenance ----------
export async function runMaintenance(job: "deadlines" | "workload" | "metrics"): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  const supabase = await createClient();
  if (job === "deadlines") {
    const { data, error } = await supabase.rpc("run_deadline_checks");
    if (error) return { ok: false, error: friendlyError(error) };
    const d = data as { due_soon: number; overdue: number; milestones: number };
    return { ok: true, message: `Reminders: ${d.due_soon} · newly overdue: ${d.overdue} · delayed milestones: ${d.milestones}` };
  }
  if (job === "workload") {
    const { data, error } = await supabase.rpc("record_workload_snapshot");
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true, message: `Workload snapshot saved for ${data} employee(s)` };
  }
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("refresh_performance_metrics", { p_period_type: "monthly", p_start: from, p_end: to });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, message: `Last month's metrics stored for ${data} employee(s)` };
}

export async function clearDemoData(confirmText: string): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  if (confirmText !== "DELETE DEMO DATA") return { ok: false, error: 'Type "DELETE DEMO DATA" to confirm.' };
  try {
    const { data, error } = await createAdminClient().rpc("clear_demo_data");
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath("/", "layout");
    const d = data as { tasks_removed: number; users_removed: number };
    return { ok: true, message: `Removed ${d.tasks_removed} demo task(s) and ${d.users_removed} demo user(s).` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
