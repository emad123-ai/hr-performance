import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFormOptions } from "@/lib/queries/options";
import { getSettings, getToday } from "@/lib/settings";
import { addDays } from "@/lib/domain/dates";
import { isUuid, sp, withParams, type SearchParams } from "@/lib/search-params";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { KpiCard } from "@/components/shared/kpi-card";
import { Callout, PrintButton } from "@/components/shared/misc";
import { EmptyState } from "@/components/shared/empty-state";
import { PriorityBadge, StatusBadge, WorkloadBadge } from "@/components/shared/badges";
import { TrendChart, SERIES } from "@/components/charts/charts";
import { ReassignButton } from "@/components/workload/reassign-button";
import { fmtDate, fmtHours } from "@/lib/format";
import { cn, pct } from "@/lib/utils";
import type { TaskOverview, WorkloadRow } from "@/lib/types";

export const metadata: Metadata = { title: "Workload" };

const BAR: Record<string, string> = { Underutilized: "bg-slate-400", Balanced: "bg-success", "High Workload": "bg-warning", Overloaded: "bg-destructive" };

export default async function WorkloadPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireRole(["admin", "team_lead"]);
  const params = await searchParams;
  const supabase = await createClient();
  const [settings, options, today] = await Promise.all([getSettings(), getFormOptions(me), getToday()]);
  const dept = sp(params, "department");
  const horizon = Number(sp(params, "horizon") ?? settings.workload.horizon_days);
  const h = [5, 10, 15, 20, 30].includes(horizon) ? horizon : settings.workload.horizon_days;
  const { data, error } = await supabase.rpc("workload_overview", { p_horizon_days: h, p_department: isUuid(dept) ? dept : null });
  if (error) throw new Error(error.message);
  const category = sp(params, "category");
  const rows = ((data ?? []) as WorkloadRow[]).filter((r) => !category || r.category === category);
  const focus = sp(params, "focus");
  const focused = rows.find((r) => r.user_id === focus) ?? null;
  const { data: focusTasks } = focused
    ? await supabase.from("task_overview").select("*").contains("assignee_ids", [focused.user_id]).not("status", "in", "(completed,cancelled)").order("due_date")
    : { data: [] };
  const { data: history } = await supabase.from("workload_records").select("record_date, utilization").gte("record_date", addDays(today, -60)).order("record_date");
  const byDate = new Map<string, number[]>();
  (history ?? []).forEach((r) => { const l = byDate.get(r.record_date as string) ?? []; l.push(Number(r.utilization ?? 0)); byDate.set(r.record_date as string, l); });
  const trend = [...byDate.entries()].map(([d, v]) => ({ date: fmtDate(d, "dd MMM"), avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), max: Math.max(...v) }));
  const count = (c: string) => rows.filter((r) => r.category === c).length;

  return (
    <>
      <PageHeader
        title="Workload management"
        description={`Utilisation = remaining estimated hours ÷ available hours in the next ${h} calendar days (working days only). Equal task counts do not mean equal workload.`}
        actions={<PrintButton />}
      />
      <FilterBar
        searchKey={null}
        filters={[
          { key: "department", label: "Department", options: options.departments.map((d) => ({ value: d.id, label: d.label })) },
          { key: "category", label: "Category", options: ["Underutilized", "Balanced", "High Workload", "Overloaded"].map((c) => ({ value: c, label: c })) },
          { key: "horizon", label: "Horizon", options: [5, 10, 15, 20, 30].map((d) => ({ value: String(d), label: `${d} days` })) },
        ]}
      />
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Overloaded" value={count("Overloaded")} tone={count("Overloaded") ? "danger" : "default"} hint={`> ${settings.workload.high_up_to}%`} />
        <KpiCard label="High workload" value={count("High Workload")} tone="warning" hint={`${settings.workload.balanced_up_to}–${settings.workload.high_up_to}%`} />
        <KpiCard label="Balanced" value={count("Balanced")} tone="success" hint={`${settings.workload.underutilized_below}–${settings.workload.balanced_up_to}%`} />
        <KpiCard label="Underutilized" value={count("Underutilized")} hint={`< ${settings.workload.underutilized_below}%`} />
      </section>
      {count("Overloaded") > 0 && count("Underutilized") > 0 && (
        <Callout tone="warning" className="mb-4">
          Imbalance detected: {rows.filter((r) => r.category === "Overloaded").map((r) => r.full_name).join(", ")} overloaded while{" "}
          {rows.filter((r) => r.category === "Underutilized").map((r) => r.full_name).join(", ")} have spare capacity. Select a person to reassign tasks.
        </Callout>
      )}
      {rows.length === 0 ? <EmptyState title="No employees in scope" /> : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">High priority</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Remaining est.</TableHead>
                <TableHead className="text-right">Actual (30d)</TableHead>
                <TableHead className="text-right">Capacity</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="w-44">Utilisation</TableHead>
                <TableHead>Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.user_id} className={cn(focus === r.user_id && "bg-accent/50")}>
                  <TableCell>
                    <Link href={withParams("/workload", params, { focus: r.user_id })} className="font-medium hover:underline" scroll={false}>{r.full_name}</Link>
                    <p className="text-xs text-muted-foreground">{r.designation ?? "—"} · {r.department_name ?? "—"}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.active_tasks}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.pending_tasks}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.high_priority_tasks}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.overdue_tasks && "font-medium text-destructive")}>{r.overdue_tasks}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtHours(r.remaining_hours)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtHours(r.actual_hours_30d)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtHours(r.capacity_hours)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtHours(r.available_hours)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={Math.min(Number(r.utilization ?? 0), 100)} className="h-2" indicatorClassName={BAR[r.category]} />
                      <span className="w-12 text-right text-xs tabular-nums">{pct(r.utilization)}</span>
                    </div>
                  </TableCell>
                  <TableCell><WorkloadBadge category={r.category} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {focused && (
        <Card className="mt-5">
          <CardHeader><CardTitle>Open tasks – {focused.full_name}</CardTitle><p className="text-xs text-muted-foreground">Reassign to rebalance; both people are notified and the change is logged.</p></CardHeader>
          <CardContent>
            {(focusTasks ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No open tasks.</p> : (
              <ul className="divide-y">
                {((focusTasks ?? []) as TaskOverview[]).map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <StatusBadge status={t.effective_status} />
                    <PriorityBadge priority={t.priority} />
                    <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{t.task_code} · {t.title}</Link>
                    <span className="text-xs text-muted-foreground">{fmtHours(t.estimated_hours)} · {t.completion_percentage}% · due {fmtDate(t.due_date)}</span>
                    <ReassignButton taskId={t.id} current={t.assignee_ids} people={options.employees} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader><CardTitle>Team utilisation history</CardTitle><p className="text-xs text-muted-foreground">Daily snapshots (recorded nightly by pg_cron or the daily cron route)</p></CardHeader>
        <CardContent>
          {trend.length < 2 ? <p className="text-sm text-muted-foreground">Not enough snapshots yet – history builds up one point per day.</p> : (
            <TrendChart data={trend} xKey="date" series={[{ key: "avg", label: "Average %", color: SERIES.blue }, { key: "max", label: "Highest individual %", color: SERIES.orange }]} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
