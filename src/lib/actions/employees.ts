"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/errors";
import { employeeSchema, fieldErrors, newEmployeeSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/lib/types";

async function assertAdmin(): Promise<string | null> {
  const me = await getCurrentUser();
  return me && me.is_active && me.role === "admin" ? me.id : null;
}

function profileFields(v: z.output<typeof employeeSchema>) {
  return {
    full_name: v.full_name, phone: v.phone, designation: v.designation, department_id: v.department_id, team_id: v.team_id,
    manager_id: v.manager_id, role: v.role, employment_status: v.employment_status, joining_date: v.joining_date,
    weekly_capacity_hours: v.weekly_capacity_hours, ...(v.employee_code ? { employee_code: v.employee_code } : {}),
  };
}

/** Creates a login (Supabase Admin API, server-side only) and the employee profile. Admins only. */
export async function createEmployee(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await assertAdmin())) return { ok: false, error: "Only administrators can create employee accounts." };
  const parsed = newEmployeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: v.email,
    password: v.password,
    email_confirm: true,
    app_metadata: { role: v.role },
    user_metadata: { full_name: v.full_name },
  });
  if (error || !data.user) return { ok: false, error: error?.message.includes("already") ? "That e-mail address is already registered." : friendlyError(error) };

  const { error: upErr } = await admin.from("profiles").update(profileFields(v)).eq("id", data.user.id);
  if (upErr) {
    await admin.auth.admin.deleteUser(data.user.id); // roll back the half-created account
    return { ok: false, error: friendlyError(upErr) };
  }
  revalidatePath("/employees");
  return { ok: true, data: { id: data.user.id }, message: `Account created for ${v.full_name}. Share the temporary password securely.` };
}

export async function updateEmployee(id: string, input: unknown): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: "Only administrators can edit employee records." };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid employee" };
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.manager_id === id) return { ok: false, error: "An employee cannot report to themself." };
  const supabase = await createClient(); // RLS: admin-only update
  const { data, error } = await supabase.from("profiles").update(profileFields(parsed.data)).eq("id", id).select("id, email");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "Employee not found or not permitted." };
  try {
    await createAdminClient().auth.admin.updateUserById(id, { app_metadata: { role: parsed.data.role } });
  } catch {
    /* role lives in profiles; app_metadata sync is best-effort */
  }
  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return { ok: true, message: "Employee updated" };
}

/** Deactivation keeps all history but blocks sign-in (profile flag + Auth ban). */
export async function setEmployeeActive(id: string, active: boolean): Promise<ActionResult> {
  const adminId = await assertAdmin();
  if (!adminId) return { ok: false, error: "Only administrators can change account status." };
  if (id === adminId && !active) return { ok: false, error: "You cannot deactivate your own account." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "Employee not found." };
  try {
    await createAdminClient().auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  } catch (e) {
    return { ok: true, message: `Status saved, but the login could not be ${active ? "unblocked" : "blocked"}: ${(e as Error).message}` };
  }
  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return { ok: true, message: active ? "Account reactivated" : "Account deactivated – history is preserved" };
}

export async function resetEmployeePassword(id: string, password: string): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: "Only administrators can reset passwords." };
  const p = z.string().min(10).max(72).regex(/[A-Za-z]/).regex(/\d/).safeParse(password);
  if (!p.success) return { ok: false, error: "Temporary password: at least 10 characters with letters and numbers." };
  try {
    const { error } = await createAdminClient().auth.admin.updateUserById(id, { password: p.data });
    if (error) return { ok: false, error: friendlyError(error) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  return { ok: true, message: "Temporary password set. Ask the employee to change it after signing in." };
}
