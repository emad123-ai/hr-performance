import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

export type CurrentUser = Profile & { department_name: string | null };

/** The signed-in user's profile (cached per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*, department:departments!profiles_department_id_fkey(name)")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return null;
  const { department, ...profile } = data as Profile & { department: { name: string } | null };
  return { ...profile, department_name: department?.name ?? null };
});

export async function requireUser(): Promise<CurrentUser> {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.is_active) redirect("/login?error=inactive");
  return me;
}

/** Server-side role gate for pages and actions (RLS enforces the same rules in the database). */
export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const me = await requireUser();
  if (!roles.includes(me.role)) redirect("/dashboard?denied=1");
  return me;
}

export const isManager = (me: Pick<Profile, "role">) => me.role === "admin" || me.role === "team_lead";
