import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle, Briefcase, CalendarClock, CalendarDays, CheckCircle2, CircleDashed, Clock3, ListTodo, Loader, Percent, Timer, Users,
} from "lucide-react";
import { requireUser, isManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPeriod } from "@/lib/period";
import { getFormOptions } from "@/lib/queries/options";
import { isUuid, sp, type SearchParams } from "@/lib/search-params";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { Callout } from "@/components/shared/misc";
import { EmptyState } from "@/components/shared/empty-state";
import { GroupedBarChart, LabeledBarList, SERIES, TrendChart } from "@/components/charts/charts";
import { PRIORITY_COLORS, PRIORITY_LABELS, PRIORITY_ORDER, STATUS_COLORS, STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { pct } from "@/lib/utils";
import type { DashboardData, TeamPerformanceRow, WorkloadRow } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

const WORKLOAD_COLOR: Record<string, string> = {
  Underutilized: "#64748b", Balanced: "#16a34a", "High Workload": "#d97706", Overloaded: "#dc2626", "No capacity": "#94a3b8",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const me = await requireUser();
  const manager = isManager(me);
  const period = await getPeriod(params);
  const supabase = await createClient();
  const department = isUuid(sp(params, "department")) ? sp(params, "department")! : null;
  const employee = isUuid(sp(params, "employee")) ? sp(params, "employee")! : null;
  const project = isUuid(sp(params, "project")) ? sp(params, "project")! : null;
  const granularity = (["day", "week", "month"] as const).find((g) => g === sp(params, "granularity")) ?? period.granularity;

  if (manager) await supabase.rpc("run_deadline_checks"); // idempotent; pg_cron also runs it hourly

  const [dash, team, workload, options] = await Promise.all([
    supabase.rpc("dashboard_summary", {
      p_from: period.from, p_to: period.to, p_granularity: granularity, p_department: department, p_employee: employee, p_project: project,
    }),
    supabase.rpc("team_performance", { p_from: period.from, p_to: period.to, p_department: department }),
    manager ? supabase.rpc("workload_overview", { p_horizon_days: null, p_department: department }) : Promise.resolve({ data: [], error: null }),
    getFormOptions(me),
  ]);
  if (dash.error) throw new Error(dash.error.message);
  const d = dash.data as DashboardData;
  const k = d.kpis;
  const teamRows = ((team.data ?? []) as TeamPerformanceRow[]).filter((r) => !employee || r.employee_id === employee);
  const wl = ((workload.data ?? []) as WorkloadRow[]).filter((r) => !employee || r.user_id === employee);

  const tasksBase = manager ? "/tasks" : "/tasks/my";
  const range = `due_from=${period.from}&due_to=${period.to}`;

  const statusData = STATUS_ORDER.filter((s) => d.by_status[s]).map((s) => ({ label: STATUS_LABELS[s], value: d.by_status[s], color: STATUS_COLORS[s] }));
  const priorityData = PRIORITY_ORDER.filter((p) => d.by_priority[p]).map((p) => ({ label: PRIORITY_LABELS[p], value: d.by_priority[p], color: PRIORITY_COLORS[p] }));
  const trend = d.trend.map((t) => ({ ...t, label: fmtDate(t.bucket, granularity === "month" ? "MMM yy" : "dd MMM") }));
  const overloaded = wl.filter((w) => w.category === "Overloaded");

  return (
    <div className="space-y-6">
      <PageHeader
        title={manager ? "Executive dashboard" : `Welcome, ${me.full_name.split(" ")[0]}`}
        description={<>Period: <strong>{period.label}</strong> ({fmtDate(period.from)} – {fmtDate(period.to)}). Change it with the date selector in the top bar.</>}
      />
      <FilterBar
        searchKey={null}
        filters={[
          ...(manager ? [
            { key: "department", label: "Department", options: options.departments.map((o) => ({ value: o.id, label: o.label })) },
            { key: "employee", label: "Employee", options: options.employees.map((o) => ({ value: o.id, label: o.label })) },
          ] : []),
          { key: "project", label: "Project", options: options.projects.map((o) => ({ value: o.id, label: o.label })) },
          { key: "granularity", label: "Trend", options: [{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }] },
        ]}
      />

      {(k.overdue > 0 || overloaded.length > 0 || k.blocked > 0) && (
        <Callout tone="warning" title="Needs management attention">
          {k.overdue > 0 && <><Link className="underline" href={`${tasksBase}?due=overdue`}>{k.overdue} overdue task(s)</Link>. </>}
          {k.blocked > 0 && <><Link className="underline" href={`${tasksBase}?status=blocked`}>{k.blocked} blocked</Link>. </>}
          {overloaded.length > 0 && <>Overloaded: {overloaded.map((o) => o.full_name).join(", ")} – <Link className="underline" href="/workload">rebalance workload</Link>.</>}
        </Callout>
      )}

      <section aria-label="Key indicators" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {manager && <KpiCard label="Employees" value={k.total_employees} icon={Users} href="/employees" hint="Active staff" />}
        <KpiCard label="Assigned" value={k.assigned_in_period} icon={ListTodo} hint="Assigned in period" href={`${tasksBase}?assigned_from=${period.from}&assigned_to=${period.to}&show=all`} />
        <KpiCard label="Completed" value={k.completed_in_period} icon={CheckCircle2} tone="success" hint="Approved in period" href={`${tasksBase}?status=completed&completed_from=${period.from}&completed_to=${period.to}`} />
        <KpiCard label="Pending" value={k.pending} icon={CircleDashed} hint="Not started (now)" href={`${tasksBase}?status=not_started`} />
        <KpiCard label="In progress" value={k.in_progress} icon={Loader} tone="info" hint={`Incl. ${k.under_review} in review, ${k.blocked} blocked`} href={`${tasksBase}?status=active`} />
        <KpiCard label="Overdue" value={k.overdue} icon={AlertTriangle} tone={k.overdue ? "danger" : "default"} hint="All open, past due" href={`${tasksBase}?due=overdue`} />
        <KpiCard label="Due today" value={k.due_today} icon={CalendarClock} tone={k.due_today ? "warning" : "default"} href={`${tasksBase}?due=today`} />
        <KpiCard label="Due this week" value={k.due_this_week} icon={CalendarDays} href={`${tasksBase}?due=week`} />
        <KpiCard label="Completion rate" value={pct(k.completion_rate)} icon={Percent} hint="Of tasks due in period" href={`${tasksBase}?${range}&show=all`} />
        <KpiCard label="On-time rate" value={pct(k.on_time_rate)} icon={Timer} tone="success" hint="Completed by deadline" href={`${tasksBase}?status=completed&completed_from=${period.from}&completed_to=${period.to}`} />
        <KpiCard label="Avg completion" value={k.avg_completion_days !== null ? `${k.avg_completion_days} d` : "—"} icon={Clock3} hint="Start → approval" />
        <KpiCard label="Active projects" value={k.active_projects} icon={Briefcase} href="/projects" />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Task completion trend</CardTitle>
            <CardDescription>Tasks assigned vs. approved per {granularity}</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length ? (
              <TrendChart data={trend} xKey="label" series={[{ key: "completed", label: "Completed", color: SERIES.blue }, { key: "created", label: "Assigned", color: SERIES.orange }]} />
            ) : <EmptyState title="No data for this period" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Overdue tasks trend</CardTitle>
            <CardDescription>Open, past-due tasks at the end of each {granularity}</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length ? <TrendChart data={trend} xKey="label" series={[{ key: "overdue", label: "Overdue", color: SERIES.red }]} /> : <EmptyState title="No data" />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Tasks by status</CardTitle><CardDescription>Due in period or still open</CardDescription></CardHeader>
          <CardContent>{statusData.length ? <LabeledBarList data={statusData} /> : <EmptyState title="No tasks" />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Open tasks by priority</CardTitle></CardHeader>
          <CardContent>{priorityData.length ? <LabeledBarList data={priorityData} /> : <EmptyState title="No open tasks" />}</CardContent>
        </Card>
        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader><CardTitle>Department distribution</CardTitle></CardHeader>
          <CardContent>
            {d.by_department.length ? (
              <GroupedBarChart data={d.by_department} xKey="name" stacked series={[
                { key: "open", label: "Open", color: SERIES.blue },
                { key: "completed", label: "Completed (period)", color: SERIES.aqua },
                { key: "overdue", label: "Overdue", color: SERIES.red },
              ]} />
            ) : <EmptyState title="No department data" />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Employee performance comparison</CardTitle>
            <CardDescription>Effort-weighted completion and on-time delivery for tasks due in the period</CardDescription>
          </CardHeader>
          <CardContent>
            {teamRows.length ? (
              <>
                <GroupedBarChart
                  percent
                  data={teamRows.map((r) => ({ name: r.full_name.split(" ")[0], completion: r.completion_rate ?? 0, on_time: r.on_time_rate ?? 0 }))}
                  xKey="name"
                  series={[{ key: "completion", label: "Completion %", color: SERIES.blue }, { key: "on_time", label: "On-time %", color: SERIES.orange }]}
                />
                {teamRows.some((r) => !r.data_sufficient) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Some people have too few completed or past-due tasks in this period for a representative comparison: {teamRows.filter((r) => !r.data_sufficient).map((r) => r.full_name).join(", ")}.
                  </p>
                )}
              </>
            ) : <EmptyState title="No performance data" />}
          </CardContent>
        </Card>
        {manager ? (
          <Card>
            <CardHeader>
              <CardTitle>Workload distribution</CardTitle>
              <CardDescription>Remaining estimated hours ÷ available hours (next working days)</CardDescription>
            </CardHeader>
            <CardContent>
              {wl.length ? (
                <LabeledBarList unit="%" data={wl.map((w) => ({ label: `${w.full_name} · ${w.category}`, value: Number(w.utilization ?? 0), color: WORKLOAD_COLOR[w.category] ?? "#64748b" }))} />
              ) : <EmptyState title="No workload data" />}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle>Your attention list</CardTitle></CardHeader>
            <CardContent><AttentionList items={d.attention} /></CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Project progress</CardTitle><CardDescription>Effort-weighted progress of open projects</CardDescription></CardHeader>
          <CardContent>
            {d.projects.length === 0 ? <EmptyState title="No active projects" /> : (
              <ul className="space-y-3">
                {d.projects.map((p) => (
                  <li key={p.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <Link href={`/projects/${p.id}`} className="truncate font-medium hover:underline">{p.name}</Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {p.is_delayed && <span className="mr-2 text-destructive">Delayed</span>}
                        {p.overdue > 0 && <span className="mr-2 text-destructive">{p.overdue} overdue</span>}
                        Target {fmtDate(p.target_date)} · <span className="font-medium tabular-nums text-foreground">{Number(p.progress).toFixed(0)}%</span>
                      </span>
                    </div>
                    <Progress value={p.progress} indicatorClassName={p.is_delayed ? "bg-destructive" : undefined} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {manager && (
          <Card>
            <CardHeader><CardTitle>Requires intervention</CardTitle><CardDescription>Overdue, blocked and critical open tasks</CardDescription></CardHeader>
            <CardContent><AttentionList items={d.attention} /></CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function AttentionList({ items }: { items: DashboardData["attention"] }) {
  if (!items.length) return <EmptyState title="Nothing needs attention" description="No overdue, blocked or critical open tasks." />;
  return (
    <ul className="divide-y">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
          <StatusBadge status={t.effective_status} />
          <div className="min-w-0 flex-1">
            <Link href={`/tasks/${t.id}`} className="block truncate font-medium hover:underline">{t.title}</Link>
            <p className="truncate text-xs text-muted-foreground">{t.task_code} · {t.assignees?.join(", ")} · due {fmtDate(t.due_date)}</p>
          </div>
          <PriorityBadge priority={t.priority} />
        </li>
      ))}
    </ul>
  );
}
