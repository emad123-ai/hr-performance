import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { requireUser, isManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/settings";
import { openTaskOptions } from "@/lib/queries/tasks";
import { addDays, isISODate } from "@/lib/domain/dates";
import { summarizePlan } from "@/lib/domain/planner";
import { sp, type SearchParams } from "@/lib/search-params";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PlanEditor } from "@/components/planner/plan-editor";
import { fmtDate } from "@/lib/format";
import { pct } from "@/lib/utils";
import type { DailyPlan, DailyPlanItem } from "@/lib/types";

export const metadata: Metadata = { title: "Daily Planner" };

export default async function PlannerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireUser();
  const params = await searchParams;
  const today = await getToday();
  const d = sp(params, "date");
  const date = isISODate(d) ? d : today;
  const supabase = await createClient();
  const { data: plan } = await supabase.from("daily_plans").select("*").eq("user_id", me.id).eq("plan_date", date).maybeSingle<DailyPlan>();
  const { data: items } = plan
    ? await supabase.from("daily_plan_items").select("*").eq("plan_id", plan.id).order("sort_order")
    : { data: [] as DailyPlanItem[] };
  const taskOptions = await openTaskOptions(me.id);
  const s = summarizePlan((items ?? []) as DailyPlanItem[]);

  return (
    <>
      <PageHeader
        title="Daily planner"
        description={`Plan your day, report what was completed and flag obstacles. ${fmtDate(date, "EEEE, dd MMMM yyyy")}`}
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="outline" asChild aria-label="Previous day"><Link href={`/planner?date=${addDays(date, -1)}`}><ChevronLeft /></Link></Button>
              <form action="/planner" className="flex">
                <input type="date" name="date" defaultValue={date} className="h-8 rounded-md border px-2 text-sm" aria-label="Date" />
                <Button size="sm" variant="outline" className="ml-1">Go</Button>
              </form>
              <Button size="icon-sm" variant="outline" asChild aria-label="Next day"><Link href={`/planner?date=${addDays(date, 1)}`}><ChevronRight /></Link></Button>
              {date !== today && <Button size="sm" variant="ghost" asChild><Link href="/planner">Today</Link></Button>}
            </div>
            {isManager(me) && <Button size="sm" asChild><Link href={`/planner/team?date=${date}`}><Users /> Team daily reports</Link></Button>}
          </>
        }
      />
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        <KpiCard label="Planned" value={s.planned} />
        <KpiCard label="Completed" value={s.completed} tone="success" />
        <KpiCard label="Pending" value={s.pending} />
        <KpiCard label="Blocked" value={s.blocked} tone={s.blocked ? "warning" : "default"} />
        <KpiCard label="Actual hours" value={s.actualHours} hint={`Estimated ${s.estimatedHours} h`} />
        <KpiCard label="Work completion" value={pct(s.completionPct)} />
      </section>
      <PlanEditor date={date} plan={plan} items={(items ?? []) as DailyPlanItem[]} taskOptions={taskOptions} />
    </>
  );
}
