import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFormOptions } from "@/lib/queries/options";
import { getSettings } from "@/lib/settings";
import { PAGE_SIZE, ROLE_SHORT, EMPLOYMENT_STATUS_LABELS } from "@/lib/constants";
import { ilikeTerm, isUuid, sp, spPage, spSort, type SearchParams } from "@/lib/search-params";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination, SortableHead } from "@/components/shared/table-controls";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoBadge, PerformanceBadge } from "@/components/shared/badges";
import { Avatar } from "@/components/shared/misc";
import { EmployeeFormDialog } from "@/components/employees/employee-form";
import { fmtDate } from "@/lib/format";
import { num } from "@/lib/utils";
import type { EmployeeDirectoryRow } from "@/lib/types";

export const metadata: Metadata = { title: "Employees" };
const SORTS = ["full_name", "employee_code", "designation", "department_name", "joining_date", "active_tasks", "completed_tasks", "overdue_tasks", "latest_score"] as const;

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireRole(["admin", "team_lead"]);
  const params = await searchParams;
  const supabase = await createClient();
  const [options, settings] = await Promise.all([getFormOptions(me), getSettings()]);
  const { sort, dir, ascending } = spSort(params, SORTS, "full_name");
  const page = spPage(params);

  let q = supabase.from("employee_directory").select("*", { count: "exact" });
  if (me.role === "team_lead") {
    // team leads see their own people (RLS also restricts the counters to tasks they may see)
    const ids = options.employees.map((e) => e.id);
    q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const search = sp(params, "q");
  if (search) q = q.or(`full_name.ilike.${ilikeTerm(search)},email.ilike.${ilikeTerm(search)},employee_code.ilike.${ilikeTerm(search)}`);
  const dept = sp(params, "department");
  if (isUuid(dept)) q = q.eq("department_id", dept);
  const designation = sp(params, "designation");
  if (designation) q = q.eq("designation", designation);
  const role = sp(params, "role");
  if (role && ["admin", "team_lead", "employee"].includes(role)) q = q.eq("role", role);
  const status = sp(params, "status") ?? "active";
  if (status === "active") q = q.eq("is_active", true);
  else if (status === "inactive") q = q.eq("is_active", false);

  const { data, count, error } = await q.order(sort, { ascending, nullsFirst: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as EmployeeDirectoryRow[];
  const { data: designationRows } = await supabase.from("profiles").select("designation").not("designation", "is", null);
  const designations = [...new Set([...(settings.designations ?? []), ...(designationRows ?? []).map((d) => d.designation as string)])].sort();
  const head = { basePath: "/employees", params, current: sort, dir };
  const formOptions = { departments: options.departments, teams: options.teams, managers: options.allPeople, designations };

  return (
    <>
      <PageHeader
        title="Employees"
        description="Directory with live task counters and the latest finalized performance score."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/api/reports/employees" prefetch={false}><Download /> Export CSV</Link>
            </Button>
            {me.role === "admin" && <EmployeeFormDialog options={formOptions} />}
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search name, e-mail or ID…"
        filters={[
          { key: "department", label: "Department", options: options.departments.map((d) => ({ value: d.id, label: d.label })) },
          { key: "designation", label: "Designation", options: designations.map((d) => ({ value: d, label: d })) },
          { key: "role", label: "Role", options: Object.entries(ROLE_SHORT).map(([value, label]) => ({ value, label })) },
          { key: "status", label: "Account", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "all", label: "All" }] },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title="No employees found" description={me.role === "admin" ? "Add your first employee to start assigning work." : "No team members match these filters."} />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Employee" column="full_name" {...head} />
                <SortableHead label="ID" column="employee_code" {...head} />
                <SortableHead label="Designation" column="designation" {...head} />
                <SortableHead label="Department" column="department_name" {...head} />
                <TableHead>Manager</TableHead>
                <SortableHead label="Joined" column="joining_date" {...head} />
                <TableHead>Status / role</TableHead>
                <SortableHead label="Active" column="active_tasks" {...head} className="text-right" />
                <SortableHead label="Done" column="completed_tasks" {...head} className="text-right" />
                <SortableHead label="Overdue" column="overdue_tasks" {...head} className="text-right" />
                <SortableHead label="Score" column="latest_score" {...head} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id} className={e.is_active ? "" : "opacity-60"}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar name={e.full_name} />
                      <div className="min-w-0">
                        <Link href={`/employees/${e.id}`} className="font-medium hover:text-info hover:underline">{e.full_name}</Link>
                        <p className="truncate text-xs text-muted-foreground">{e.email}</p>
                      </div>
                      {e.is_demo && <DemoBadge />}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.employee_code}</TableCell>
                  <TableCell className="text-sm">{e.designation ?? "—"}</TableCell>
                  <TableCell className="text-sm">{e.department_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{e.manager_name ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDate(e.joining_date)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge className={e.is_active ? "border-green-200 bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}>
                        {e.is_active ? EMPLOYMENT_STATUS_LABELS[e.employment_status] : "Inactive"}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{ROLE_SHORT[e.role]}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{e.active_tasks}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.completed_tasks}</TableCell>
                  <TableCell className={`text-right tabular-nums ${e.overdue_tasks ? "font-medium text-destructive" : ""}`}>{e.overdue_tasks}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{num(e.latest_score, 1)}</span>
                      <PerformanceBadge category={e.latest_category} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination basePath="/employees" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
        </div>
      )}
    </>
  );
}
