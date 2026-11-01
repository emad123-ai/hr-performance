import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/settings";
import { getFormOptions } from "@/lib/queries/options";
import { addDays, isISODate } from "@/lib/domain/dates";
import { summarizePlan } from "@/lib/domain/planner";
import { sp, type SearchParams } from "@/lib/search-params";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PrintButton } from "@/components/shared/misc";
import { PLAN_STATUS_LABELS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { pct } from "@/lib/utils";
import type { DailyPlan, DailyPlanItem } from "@/lib/types";

export const metadata: Metadata = { title: "Team daily reports" };

export default async function TeamPlannerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireRole(["admin", "team_lead"]);
  const params = await searchParams;
  const today = await getToday();
  const d = sp(params, "date");
  const date = isISODate(d) ? d : today;
  const supabase = await createClient();
  const options = await getFormOptions(me);
  const people = options.employees.filter((p) => p.id !== me.id);
  const { data: plans } = await supabase
    .from("daily_plans")
    .select("*, items:daily_plan_items(*)")
    .eq("plan_date", date)
    .in("user_id", people.length ? people.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"]);
  const byUser = new Map(((plans ?? []) as (DailyPlan & { items: DailyPlanItem[] })[]).map((p) => [p.user_id, p]));
  const missing = people.filter((p) => !byUser.get(p.id)?.submitted_at);

  return (
    <>
      <PageHeader
        title="Team daily reports"
        description={fmtDate(date, "EEEE, dd MMMM yyyy")}
        actions={
          <>
            <Button size="icon-sm" variant="outline" asChild aria-label="Previous day"><Link href={`/planner/team?date=${addDays(date, -1)}`}><ChevronLeft /></Link></Button>
            <Button size="icon-sm" variant="outline" asChild aria-label="Next day"><Link href={`/planner/team?date=${addDays(date, 1)}`}><ChevronRight /></Link></Button>
            <PrintButton />
          </>
        }
      />
      {missing.length > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">Not yet submitted: {missing.map((m) => m.label).join(", ")}</p>
      )}
      {people.length === 0 ? <EmptyState title="No team members" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {people.map((p) => {
            const plan = byUser.get(p.id);
            const items = (plan?.items ?? []).sort((a, b) => a.sort_order - b.sort_order);
            const s = summarizePlan(items);
            return (
              <Card key={p.id}>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle><Link href={`/employees/${p.id}`} className="hover:underline">{p.label}</Link></CardTitle>
                    <p className="text-xs text-muted-foreground">{p.hint}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {plan?.assistance_needed && <Badge variant="warning"><HelpCircle /> Needs help</Badge>}
                    <Badge variant={plan?.submitted_at ? "success" : "outline"}>{plan?.submitted_at ? "Submitted" : plan ? "Draft" : "No plan"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {plan ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {s.completed}/{s.planned} completed · {s.pending} pending · {s.blocked} blocked · {s.actualHours} h actual / {s.estimatedHours} h est · {pct(s.completionPct)}
                      </p>
                      <ul className="space-y-1">
                        {items.map((i) => (
                          <li key={i.id} className="flex items-start justify-between gap-2">
                            <span className={i.status === "completed" ? "text-muted-foreground line-through" : ""}>
                              {i.task_id ? <Link className="hover:underline" href={`/tasks/${i.task_id}`}>{i.title}</Link> : i.title}
                              {i.obstacle && <span className="block text-xs text-amber-700">⚠ {i.obstacle}</span>}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{PLAN_STATUS_LABELS[i.status]}</span>
                          </li>
                        ))}
                      </ul>
                      {plan.obstacles && <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">Obstacles: {plan.obstacles}</p>}
                      {plan.assistance_needed && plan.assistance_details && <p className="rounded bg-blue-50 p-2 text-xs text-blue-900">Help requested: {plan.assistance_details}</p>}
                    </>
                  ) : <p className="text-muted-foreground">No plan recorded for this day.</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
