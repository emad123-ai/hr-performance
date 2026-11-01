import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getManagedUserIds } from "@/lib/queries/people";
import { getSettings, getToday } from "@/lib/settings";
import { addMonths, endOfMonth, startOfMonth } from "@/lib/domain/dates";
import { weightedScore } from "@/lib/domain/scoring";
import { isUuid } from "@/lib/search-params";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { PerformanceBadge } from "@/components/shared/badges";
import { Callout, PrintButton } from "@/components/shared/misc";
import { KpiBreakdown } from "@/components/performance/kpi-breakdown";
import { TrendChart, SERIES } from "@/components/charts/charts";
import { fmtDate } from "@/lib/format";
import { num, pct } from "@/lib/utils";
import type { PerformanceReview } from "@/lib/types";

export const metadata: Metadata = { title: "Performance scorecard" };

interface Metrics { eligible_tasks: number; completed_tasks: number; on_time_tasks: number; late_tasks: number; missed_tasks: number; excluded_tasks: number; pending_not_due: number; awaiting_review: number; completion_rate: number | null; on_time_rate: number | null; quality_score: number | null }

function Delta({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null) return <span className="text-xs text-muted-foreground">no comparison</span>;
  const d = Math.round((now - before) * 10) / 10;
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;
  return <span className={`inline-flex items-center text-xs ${d > 0 ? "text-success" : d < 0 ? "text-destructive" : "text-muted-foreground"}`}><Icon className="size-3" />{d > 0 ? "+" : ""}{d} vs last month</span>;
}

export default async function EmployeeScorecardPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  if (!isUuid(employeeId)) notFound();
  const me = await requireUser();
  const managed = await getManagedUserIds(me);
  if (employeeId !== me.id && !managed.has(employeeId)) redirect("/performance");
  const supabase = await createClient();
  const today = await getToday();
  const thisFrom = startOfMonth(today);
  const lastFrom = addMonths(thisFrom, -1);
  const [{ data: emp }, cur, prev, trend, reviews, settings] = await Promise.all([
    supabase.from("profiles").select("id, full_name, designation, employee_code").eq("id", employeeId).maybeSingle(),
    supabase.rpc("calc_employee_performance", { p_employee: employeeId, p_from: thisFrom, p_to: endOfMonth(today) }),
    supabase.rpc("calc_employee_performance", { p_employee: employeeId, p_from: lastFrom, p_to: endOfMonth(lastFrom) }),
    supabase.rpc("performance_trend", { p_employee: employeeId, p_months: 12 }),
    supabase.from("performance_reviews").select("*").eq("employee_id", employeeId).order("period_start", { ascending: false }),
    getSettings(),
  ]);
  if (!emp) notFound();
  const m = (cur.data?.[0] ?? null) as Metrics | null;
  const p = (prev.data?.[0] ?? null) as Metrics | null;
  const allReviews = (reviews.data ?? []) as PerformanceReview[];
  const latest = allReviews.find((r) => r.status === "finalized") ?? null;
  const ind = (x: Metrics | null) => (x ? weightedScore({ completion: x.completion_rate, on_time: x.on_time_rate, quality: x.quality_score, ownership: null, communication: null }, settings.kpi_weights).score : null);
  const trendData = ((trend.data ?? []) as { period_start: string; indicative_score: number | null; review_score: number | null; eligible_tasks: number }[])
    .map((t) => ({ month: fmtDate(t.period_start, "MMM yy"), indicative: t.eligible_tasks >= settings.performance_rules.min_tasks_for_evaluation ? t.indicative_score : null, review: t.review_score }));
  const canReview = managed.has(employeeId) && employeeId !== me.id;
  const sufficient = (m?.eligible_tasks ?? 0) >= settings.performance_rules.min_tasks_for_evaluation;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${emp.full_name} – performance`}
        description={`${emp.designation ?? ""} · ${emp.employee_code}`}
        actions={
          <>
            <PrintButton />
            {canReview && <Button size="sm" asChild><Link href={`/performance/review?employee=${employeeId}&type=monthly&anchor=${lastFrom}`}>Review last month</Link></Button>}
            {canReview && <Button size="sm" variant="outline" asChild><Link href={`/employees/${employeeId}`}>Employee profile</Link></Button>}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Official score</CardTitle><p className="text-xs text-muted-foreground">Latest finalized review</p></CardHeader>
          <CardContent className="space-y-2">
            {latest ? (
              <>
                <p className="text-4xl font-semibold tabular-nums">{num(latest.overall_score, 1)}<span className="text-base font-normal text-muted-foreground"> / 100</span></p>
                <PerformanceBadge category={latest.category} provisional={latest.is_provisional} />
                <p className="text-xs text-muted-foreground capitalize">{latest.period_type} · {fmtDate(latest.period_start)} – {fmtDate(latest.period_end)}</p>
              </>
            ) : <p className="text-sm text-muted-foreground">No finalized review yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>This month (indicative)</CardTitle><p className="text-xs text-muted-foreground">Automatic KPIs only · live</p></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-4xl font-semibold tabular-nums">{sufficient ? num(ind(m), 1) : "—"}</p>
            {sufficient ? <Delta now={ind(m)} before={(p?.eligible_tasks ?? 0) >= settings.performance_rules.min_tasks_for_evaluation ? ind(p) : null} /> : <p className="text-xs text-muted-foreground">Insufficient data so far ({m?.eligible_tasks ?? 0} task(s) with an outcome).</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>This month at a glance</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Completed</span><span className="text-right tabular-nums">{m?.completed_tasks ?? 0}</span>
            <span className="text-muted-foreground">On time</span><span className="text-right tabular-nums">{m?.on_time_tasks ?? 0}</span>
            <span className="text-muted-foreground">Late / missed</span><span className="text-right tabular-nums">{m?.late_tasks ?? 0} / {m?.missed_tasks ?? 0}</span>
            <span className="text-muted-foreground">Excused (external/mgmt)</span><span className="text-right tabular-nums">{m?.excluded_tasks ?? 0}</span>
            <span className="text-muted-foreground">Awaiting review</span><span className="text-right tabular-nums">{m?.awaiting_review ?? 0}</span>
            <span className="text-muted-foreground">Not yet due</span><span className="text-right tabular-nums">{m?.pending_not_due ?? 0}</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>KPI breakdown – this month vs last month</CardTitle>
            <p className="text-xs text-muted-foreground">Completion {pct(m?.completion_rate, 1)} (last {pct(p?.completion_rate, 1)}) · On-time {pct(m?.on_time_rate, 1)} (last {pct(p?.on_time_rate, 1)})</p>
          </CardHeader>
          <CardContent>
            <KpiBreakdown
              weights={latest?.weights ?? settings.kpi_weights}
              eligible={m?.eligible_tasks}
              components={{
                completion: m?.completion_rate ?? null, on_time: m?.on_time_rate ?? null, quality: m?.quality_score ?? null,
                ownership: latest?.ownership_rating ? Math.round((latest.ownership_rating / latest.rating_scale) * 10000) / 100 : null,
                communication: latest?.communication_rating ? Math.round((latest.communication_rating / latest.rating_scale) * 10000) / 100 : null,
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">Ownership and communication shown from the latest finalized review.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Performance trend (12 months)</CardTitle><p className="text-xs text-muted-foreground">Months with too few tasks are left blank</p></CardHeader>
          <CardContent>
            <TrendChart percent data={trendData} xKey="month" series={[{ key: "indicative", label: "Indicative (auto)", color: SERIES.blue }, { key: "review", label: "Finalized review", color: SERIES.orange }]} />
          </CardContent>
        </Card>
      </div>

      {latest && (
        <Card>
          <CardHeader><CardTitle>Latest review feedback</CardTitle></CardHeader>
          <CardContent className="grid gap-4 text-sm md:grid-cols-2">
            <div><p className="text-xs font-medium uppercase text-muted-foreground">Strengths</p><p className="whitespace-pre-wrap">{latest.strengths ?? "—"}</p></div>
            <div><p className="text-xs font-medium uppercase text-muted-foreground">Areas for improvement</p><p className="whitespace-pre-wrap">{latest.improvements ?? "—"}</p></div>
            <div><p className="text-xs font-medium uppercase text-muted-foreground">Manager&apos;s comments</p><p className="whitespace-pre-wrap">{latest.manager_comments ?? "—"}</p></div>
            <div><p className="text-xs font-medium uppercase text-muted-foreground">Improvement action plan</p><p className="whitespace-pre-wrap">{latest.action_plan ?? "—"}</p></div>
            {latest.data_warnings.length > 0 && <Callout tone="warning" className="md:col-span-2">{latest.data_warnings.join(" ")}</Callout>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Review history</CardTitle></CardHeader>
        <CardContent>
          {allReviews.length === 0 ? <p className="text-sm text-muted-foreground">No reviews.</p> : (
            <ul className="divide-y text-sm">
              {allReviews.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/performance/review?id=${r.id}`} className="hover:underline">
                    <span className="capitalize">{r.period_type}</span> · {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{num(r.overall_score, 1)}</span>
                    <PerformanceBadge category={r.category} provisional={r.is_provisional} />
                    <span className="text-xs capitalize text-muted-foreground">{r.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
