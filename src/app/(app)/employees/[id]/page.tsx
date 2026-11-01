import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Mail, Phone, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFormOptions } from "@/lib/queries/options";
import { getManagedUserIds } from "@/lib/queries/people";
import { listTasks, TASK_SORTS } from "@/lib/queries/tasks";
import { getPeriod } from "@/lib/period";
import { getSettings } from "@/lib/settings";
import { isUuid, spSort, type SearchParams } from "@/lib/search-params";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/kpi-card";
import { DemoBadge, PerformanceBadge, WorkloadBadge } from "@/components/shared/badges";
import { Avatar } from "@/components/shared/misc";
import { TaskTable } from "@/components/tasks/task-table";
import { TrendChart, SERIES } from "@/components/charts/charts";
import { EmployeeAccountActions, EmployeeFormDialog } from "@/components/employees/employee-form";
import { EMPLOYMENT_STATUS_LABELS, ROLE_LABELS } from "@/lib/constants";
import { fmtDate, fmtHours } from "@/lib/format";
import { num, pct } from "@/lib/utils";
import type { EmployeeDirectoryRow, PerformanceReview, WorkloadRow } from "@/lib/types";

export const metadata: Metadata = { title: "Employee profile" };

export default async function EmployeeProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const sparams = await searchParams;
  if (!isUuid(id)) notFound();
  const me = await requireUser();
  const managed = await getManagedUserIds(me);
  if (id !== me.id && !managed.has(id)) redirect("/dashboard?denied=1");

  const supabase = await createClient();
  const { data: emp } = await supabase.from("employee_directory").select("*").eq("id", id).maybeSingle<EmployeeDirectoryRow>();
  if (!emp) notFound();
  const period = await getPeriod(sparams);
  const [trend, perf, reviews, workload, settings, tasks] = await Promise.all([
    supabase.rpc("performance_trend", { p_employee: id, p_months: 6 }),
    supabase.rpc("calc_employee_performance", { p_employee: id, p_from: period.from, p_to: period.to }),
    supabase.from("performance_reviews").select("*").eq("employee_id", id).order("period_start", { ascending: false }).limit(6),
    supabase.rpc("workload_overview", { p_horizon_days: null, p_department: null }),
    getSettings(),
    listTasks({ scope: "team", userId: me.id, today: period.today, params: { ...sparams, assignee: id, show: "all" } }),
  ]);
  const m = (perf.data ?? [])[0] as { completion_rate: number | null; on_time_rate: number | null; quality_score: number | null; eligible_tasks: number } | undefined;
  const wl = ((workload.data ?? []) as WorkloadRow[]).find((w) => w.user_id === id);
  const trendData = ((trend.data ?? []) as { period_start: string; completion_rate: number | null; on_time_rate: number | null; quality_score: number | null }[])
    .map((t) => ({ month: fmtDate(t.period_start, "MMM yy"), completion: t.completion_rate, on_time: t.on_time_rate, quality: t.quality_score }));
  const { sort, dir } = spSort(sparams, TASK_SORTS, "due_date", "asc");
  const isAdmin = me.role === "admin";
  const options = isAdmin ? await getFormOptions(me) : null;

  return (
    <div className="space-y-5">
      <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-no-print>
        <ArrowLeft className="size-4" /> Employees
      </Link>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <Avatar name={emp.full_name} className="size-14 text-lg" />
            <div className="space-y-1">
              <h1 className="flex items-center gap-2 text-xl font-semibold">{emp.full_name} {emp.is_demo && <DemoBadge />}</h1>
              <p className="text-sm text-muted-foreground">{emp.designation ?? "—"} · {emp.department_name ?? "No department"} · {emp.employee_code}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1"><Mail className="size-3.5" /> {emp.email}</span>
                {emp.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" /> {emp.phone}</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                {ROLE_LABELS[emp.role]} · {emp.is_active ? EMPLOYMENT_STATUS_LABELS[emp.employment_status] : "Inactive account"} · Joined {fmtDate(emp.joining_date)} ·
                Reports to {emp.manager_name ?? "—"} · Team {emp.team_name ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" data-no-print>
            {managed.has(id) && (
              <Button size="sm" asChild><Link href={`/tasks/new?assignee=${id}`}><Plus /> Assign task</Link></Button>
            )}
            {managed.has(id) && <Button size="sm" variant="outline" asChild><Link href={`/performance/${id}`}>Performance</Link></Button>}
            {isAdmin && options && (
              <>
                <EmployeeFormDialog employee={emp} options={{ departments: options.departments, teams: options.teams, managers: options.allPeople, designations: settings.designations }} />
                <EmployeeAccountActions id={id} name={emp.full_name} active={emp.is_active} isSelf={id === me.id} />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Active tasks" value={emp.active_tasks} />
        <KpiCard label="Completed" value={emp.completed_tasks} tone="success" />
        <KpiCard label="Overdue" value={emp.overdue_tasks} tone={emp.overdue_tasks ? "danger" : "default"} />
        <KpiCard label="Completion" value={pct(m?.completion_rate)} hint={period.label} />
        <KpiCard label="On-time" value={pct(m?.on_time_rate)} hint={period.label} />
        <KpiCard label="Workload" value={wl ? pct(wl.utilization) : "—"} hint={wl ? `${fmtHours(wl.remaining_hours)} of ${fmtHours(wl.capacity_hours)}` : undefined} />
        <KpiCard label="Latest score" value={num(emp.latest_score, 1)} hint={emp.latest_category ?? "No finalized review"} />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Performance trend (6 months)</CardTitle></CardHeader>
          <CardContent>
            <TrendChart percent data={trendData} xKey="month" series={[
              { key: "completion", label: "Completion %", color: SERIES.blue },
              { key: "on_time", label: "On-time %", color: SERIES.orange },
              { key: "quality", label: "Quality %", color: SERIES.aqua },
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Reviews</CardTitle>
            {wl && <WorkloadBadge category={wl.category} />}
          </CardHeader>
          <CardContent>
            {(reviews.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No reviews yet.</p> : (
              <ul className="divide-y">
                {((reviews.data ?? []) as PerformanceReview[]).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/performance/review?id=${r.id}`} className="hover:underline">
                      {fmtDate(r.period_start, "MMM yyyy")} <span className="capitalize text-muted-foreground">· {r.period_type} · {r.status}</span>
                    </Link>
                    <span className="flex items-center gap-2"><span className="tabular-nums">{num(r.overall_score, 1)}</span><PerformanceBadge category={r.category} provisional={r.is_provisional} /></span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Task history</h2>
        <TaskTable rows={tasks.rows} total={tasks.total} page={tasks.page} pageSize={tasks.pageSize} basePath={`/employees/${id}`} params={sparams} sort={sort} dir={dir} showAssignees={false} />
      </div>
    </div>
  );
}
