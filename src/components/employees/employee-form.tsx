"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2, Pencil, Power, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { employeeSchema, newEmployeeSchema } from "@/lib/validation/schemas";
import { createEmployee, resetEmployeePassword, setEmployeeActive, updateEmployee } from "@/lib/actions/employees";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { FieldError } from "@/components/shared/misc";
import { EMPLOYMENT_STATUS_LABELS, ROLE_LABELS } from "@/lib/constants";
import type { Option } from "@/lib/queries/options";
import type { Profile } from "@/lib/types";

interface Opts { departments: Option[]; teams: Option[]; managers: Option[]; designations: string[] }
type Values = Record<string, unknown>;

export function EmployeeFormDialog({ employee, options, trigger }: { employee?: Profile; options: Opts; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const isNew = !employee;
  const form = useForm<Values>({
    resolver: zodResolver(isNew ? newEmployeeSchema : employeeSchema) as never,
    defaultValues: {
      full_name: employee?.full_name ?? "", email: employee?.email ?? "", employee_code: employee?.employee_code ?? "",
      phone: employee?.phone ?? "", designation: employee?.designation ?? "", department_id: employee?.department_id ?? "",
      team_id: employee?.team_id ?? "", manager_id: employee?.manager_id ?? "", role: employee?.role ?? "employee",
      employment_status: employee?.employment_status ?? "active", joining_date: employee?.joining_date ?? "",
      weekly_capacity_hours: employee?.weekly_capacity_hours ?? "", password: "",
    },
  });
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;
  const submit = form.handleSubmit((v) =>
    start(async () => {
      const res = isNew ? await createEmployee(v) : await updateEmployee(employee!.id, v);
      if (!res.ok) {
        toast.error(res.error);
        Object.entries(res.fieldErrors ?? {}).forEach(([k, m]) => form.setError(k, { message: m?.[0] }));
        return;
      }
      toast.success(res.message ?? "Saved");
      setOpen(false);
      if (isNew) form.reset();
      router.refresh();
    }),
  );
  const field = (name: string, label: string, el: React.ReactNode) => (
    <div className="space-y-1.5">
      <Label htmlFor={`emp-${name}`}>{label}</Label>
      {el}
      <FieldError message={errors[name]?.message} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>
        {trigger ?? (isNew ? <Button><UserPlus /> Add employee</Button> : <Button size="sm" variant="outline"><Pencil /> Edit</Button>)}
      </span>
      <DialogContent className="max-w-2xl">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{isNew ? "Add employee" : `Edit ${employee!.full_name}`}</DialogTitle>
            <DialogDescription>{isNew ? "Creates a sign-in account with a temporary password." : "Changes are recorded in the audit log."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("full_name", "Full name *", <Input id="emp-full_name" {...form.register("full_name")} />)}
            {field("email", "Official e-mail *", <Input id="emp-email" type="email" disabled={!isNew} {...form.register("email")} />)}
            {field("employee_code", "Employee ID", <Input id="emp-employee_code" placeholder="Auto-generated if empty" {...form.register("employee_code")} />)}
            {field("phone", "Phone", <Input id="emp-phone" {...form.register("phone")} />)}
            {field("designation", "Designation", (
              <>
                <Input id="emp-designation" list="designations" {...form.register("designation")} />
                <datalist id="designations">{options.designations.map((d) => <option key={d} value={d} />)}</datalist>
              </>
            ))}
            {field("department_id", "Department", (
              <NativeSelect id="emp-department_id" {...form.register("department_id")}>
                <option value="">— None —</option>
                {options.departments.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </NativeSelect>
            ))}
            {field("team_id", "Team", (
              <NativeSelect id="emp-team_id" {...form.register("team_id")}>
                <option value="">— None —</option>
                {options.teams.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </NativeSelect>
            ))}
            {field("manager_id", "Reporting manager", (
              <NativeSelect id="emp-manager_id" {...form.register("manager_id")}>
                <option value="">— None —</option>
                {options.managers.filter((m) => m.id !== employee?.id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </NativeSelect>
            ))}
            {field("role", "User role *", (
              <NativeSelect id="emp-role" {...form.register("role")}>
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            ))}
            {field("employment_status", "Employment status", (
              <NativeSelect id="emp-employment_status" {...form.register("employment_status")}>
                {Object.entries(EMPLOYMENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            ))}
            {field("joining_date", "Joining date", <Input id="emp-joining_date" type="date" {...form.register("joining_date")} />)}
            {field("weekly_capacity_hours", "Weekly capacity (hours)", <Input id="emp-weekly_capacity_hours" type="number" min={0} max={80} placeholder="Default from settings" {...form.register("weekly_capacity_hours")} />)}
            {isNew && field("password", "Temporary password *", <Input id="emp-password" type="text" autoComplete="off" placeholder="Min. 10 chars, letters + numbers" {...form.register("password")} />)}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending && <Loader2 className="animate-spin" />} {isNew ? "Create account" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EmployeeAccountActions({ id, name, active, isSelf }: { id: string; name: string; active: boolean; isSelf: boolean }) {
  const [pending, start] = useTransition();
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const router = useRouter();
  const run = (fn: () => ReturnType<typeof setEmployeeActive>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Saved");
        router.refresh();
      }
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setPwOpen(true)}><KeyRound /> Reset password</Button>
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set temporary password</DialogTitle>
            <DialogDescription>For {name}. Share it securely and ask them to change it.</DialogDescription>
          </DialogHeader>
          <Input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min. 10 characters, letters + numbers" />
          <DialogFooter>
            <Button disabled={pending || pw.length < 10} onClick={() => run(async () => { const r = await resetEmployeePassword(id, pw); if (r.ok) { setPwOpen(false); setPw(""); } return r; })}>Set password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {!isSelf && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant={active ? "destructive" : "success"} disabled={pending}><Power /> {active ? "Deactivate" : "Reactivate"}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{active ? `Deactivate ${name}?` : `Reactivate ${name}?`}</AlertDialogTitle>
              <AlertDialogDescription>
                {active
                  ? "They will be signed out and unable to log in. Tasks, history and reviews are kept. Reassign their open tasks from the Workload page."
                  : "They will be able to sign in again with their existing password."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(() => setEmployeeActive(id, !active))}>{active ? "Deactivate" : "Reactivate"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
