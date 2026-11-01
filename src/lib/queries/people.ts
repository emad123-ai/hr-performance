import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import type { TaskOverview } from "@/lib/types";

/** IDs of people the current user supervises (mirrors public.manages_user). */
export const getManagedUserIds = cache(async (me: CurrentUser): Promise<Set<string>> => {
  if (me.role === "employee") return new Set();
  const supabase = await createClient();
  if (me.role === "admin") {
    const { data } = await supabase.from("profiles").select("id");
    return new Set((data ?? []).map((p) => p.id as string));
  }
  const { data: teams } = await supabase.from("teams").select("id").eq("lead_id", me.id);
  const teamIds = (teams ?? []).map((t) => t.id as string);
  let q = supabase.from("profiles").select("id").neq("id", me.id);
  q = teamIds.length ? q.or(`manager_id.eq.${me.id},team_id.in.(${teamIds.join(",")})`) : q.eq("manager_id", me.id);
  const { data } = await q;
  return new Set((data ?? []).map((p) => p.id as string));
});

/** UI hint mirroring public.can_manage_task (the database re-checks on every action). */
export function canManageTask(me: CurrentUser, task: Pick<TaskOverview, "assigned_by" | "assignee_ids">, managed: Set<string>) {
  if (me.role === "admin") return true;
  if (me.role !== "team_lead") return false;
  return task.assigned_by === me.id || task.assignee_ids.some((id) => managed.has(id));
}
