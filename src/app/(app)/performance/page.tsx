import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPeriod } from "@/lib/period";
import { getFormOptions } from "@/lib/queries/options";
import { getSettings } from "@/lib/settings";
import { isUuid, sp, type SearchParams } from "@/lib/search-params";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Callout, PrintButton } from "@/components/shared/misc";
import { EmptyState } from "@/components/shared/empty-state";
import { PerformanceBadge } from "@/components/shared/badges";
import { fmtDate } from "@/lib/format";
import { num, pct } from "@/lib/utils";
import type { TeamPerformanceRow } from "@/lib/types";

export const metadata: Metadata = { title: "Performance" };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireUser();
  if (me.role === "employee") redirect(`/performance/${me.id}`);
  const params = await searchParams;
  const period = await getPeriod(params);
  const supabase = await createClient();
  const dept = sp(params, "department");
  const [{ data, error }, options, settings] = await Promise.all([
    supabase.rpc("team_performance", { p_from: period.from, p_to: period.to, p_department: isUuid(dept) ? dept : null }),
    getFormOptions(me),
    getSettings(),
  ]);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as TeamPerformanceRow[]).filter((r) => r.employee_id !== me.id);
  const reviewType = (["monthly", "quarterly", "annual"] as const).find((t) => t === sp(params, "type")) ?? "monthly";

  return (
    <>
      <PageHeader
        title="Team performance"
        description={<>Scorecards for <strong>{period.label}</strong> ({fmtDate(period.from)} – {fmtDate(period.to)}). Automatic metrics update live from task records.</>}
        actions={<PrintButton />}
      />
      <Callout className="mb-4">
        The <strong>indicative score</strong> uses only automatic KPIs (completion, on-time, task quality ratings) and is a guide for discussion.
        Official scores come from finalized reviews, which add manager ratings for ownership and communication (weights: completion {settings.kpi_weights.completion}%,
        on-time {settings.kpi_weights.on_time}%, quality {settings.kpi_weights.quality}%, ownership {settings.kpi_weights.ownership}%, communication {settings.kpi_weights.communication}%).
      </Callout>
      <FilterBar
        searchKey={null}
        filters={[
          { key: "department", label: "Department", options: options.departments.map((d) => ({ value: d.id, label: d.label })) },
          { key: "type", label: "New review type", options: [{ value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "annual", label: "Annual" }] },
        ]}
      />
      {rows.length === 0 ? <EmptyState title="No team members to evaluate" /> : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Eligible</TableHead>
                <TableHead className="text-right">Done</TableHead>
                <TableHead className="text-right">Late / missed</TableHead>
                <TableHead className="text-right">Excused</TableHead>
                <TableHead className="text-right">Completion</TableHead>
                <TableHead className="text-right">On-time</TableHead>
                <TableHead className="text-right">Quality</TableHead>
                <TableHead className="text-right">Indicative</TableHead>
                <TableHead>Review</TableHead>
                <TableHead data-no-print />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.employee_id}>
                  <TableCell>
                    <Link href={`/performance/${r.employee_id}`} className="font-medium hover:underline">{r.full_name}</Link>
                    <p className="text-xs text-muted-foreground">{r.designation ?? "—"} · {r.department_name ?? "—"}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.eligible_tasks}{r.pending_not_due > 0 && <span className="block text-[11px] text-muted-foreground">+{r.pending_not_due} not due</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.completed_tasks}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.late_tasks} / {r.missed_tasks}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.excluded_tasks}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.completion_rate, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.on_time_rate, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.quality_score, 0)}</TableCell>
                  <TableCell className="text-right">
                    {r.data_sufficient ? <span className="font-medium tabular-nums">{num(r.indicative_score, 1)}</span> : <span className="text-xs text-muted-foreground" title="Too few tasks with an outcome">Insufficient data</span>}
                  </TableCell>
                  <TableCell>
                    {r.review_id ? (
                      <Link href={`/performance/review?id=${r.review_id}`} className="flex items-center gap-2 hover:underline">
                        <span className="tabular-nums">{num(r.review_score, 1)}</span>
                        <PerformanceBadge category={r.review_category} />
                        <span className="text-[11px] capitalize text-muted-foreground">{r.review_status}</span>
                      </Link>
                    ) : <span className="text-xs text-muted-foreground">None</span>}
                  </TableCell>
                  <TableCell data-no-print>
                    {!r.review_id && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/performance/review?employee=${r.employee_id}&type=${reviewType}&anchor=${period.from}`}>Start review</Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
