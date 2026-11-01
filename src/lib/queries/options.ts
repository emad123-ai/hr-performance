import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";

export interface Option { id: string; label: string; hint?: string | null }
export interface CategoryOption extends Option { group: string }

export interface FormOptions {
  employees: Option[]; // people the current user may assign work to
  allPeople: Option[]; // everyone visible (for owner pickers / filters)
  departments: Option[];
  teams: Option[];
  projects: Option[];
  categories: CategoryOption[];
}

/** Lookup lists for forms and filters. Assignable people are limited to the user's authority. */
export const getFormOptions = cache(async (me: CurrentUser): Promise<FormOptions> => {
  const supabase = await createClient();
  const [people, depts, teams, projects, cats] = await Promise.all([
    supabase.from("profiles").select("id, full_name, designation, team_id, manager_id, role, is_active").eq("is_active", true).order("full_name"),
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
    supabase.from("teams").select("id, name, lead_id").order("name"),
    supabase.from("projects").select("id, name, project_code, status").in("status", ["planning", "active", "on_hold"]).order("name"),
    supabase.from("categories").select("id, name, group_name, sort_order").eq("is_active", true).order("group_name").order("sort_order"),
  ]);

  const ledTeams = new Set((teams.data ?? []).filter((t) => t.lead_id === me.id).map((t) => t.id));
  const allPeople = (people.data ?? []).map((p) => ({ id: p.id, label: p.full_name, hint: p.designation }));
  const employees = (people.data ?? [])
    .filter((p) => me.role === "admin" || p.id === me.id || p.manager_id === me.id || (p.team_id && ledTeams.has(p.team_id)))
    .map((p) => ({ id: p.id, label: p.full_name, hint: p.designation }));

  return {
    employees,
    allPeople,
    departments: (depts.data ?? []).map((d) => ({ id: d.id, label: d.name })),
    teams: (teams.data ?? []).map((t) => ({ id: t.id, label: t.name })),
    projects: (projects.data ?? []).map((p) => ({ id: p.id, label: `${p.project_code} · ${p.name}` })),
    categories: (cats.data ?? []).map((c) => ({ id: c.id, label: c.name, group: c.group_name })),
  };
});
