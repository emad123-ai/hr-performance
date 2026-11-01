"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERIOD_PRESETS } from "@/lib/domain/periods";
import { isISODate } from "@/lib/domain/dates";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const PERIOD_COOKIE = "hrp_period";

export async function setPeriod(preset: string, from?: string, to?: string): Promise<ActionResult> {
  if (!PERIOD_PRESETS.some((p) => p.value === preset)) return { ok: false, error: "Unknown period" };
  if (preset === "custom" && !(isISODate(from) && isISODate(to) && from <= to)) return { ok: false, error: "Choose a valid date range" };
  const store = await cookies();
  store.set(PERIOD_COOKIE, [preset, from ?? "", to ?? ""].join("|"), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveNotificationPreferences(disabledTypes: string[]): Promise<ActionResult> {
  const parsed = z.array(z.string().max(60)).max(50).safeParse(disabledTypes);
  if (!parsed.success) return { ok: false, error: "Invalid preferences" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: auth.user.id, disabled_types: parsed.data, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/notifications");
  return { ok: true, message: "Notification settings saved" };
}

export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: ids && ids.length ? ids : null });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteNotification(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/notifications");
  return { ok: true };
}

export async function updateMyPhone(phone: string): Promise<ActionResult> {
  const v = z.string().trim().max(30).safeParse(phone);
  if (!v.success) return { ok: false, error: "Phone number is too long" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", { p_phone: v.data, p_avatar_url: null });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/profile");
  return { ok: true, message: "Profile updated" };
}
