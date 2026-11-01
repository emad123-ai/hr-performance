import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getManagedUserIds } from "@/lib/queries/people";
import { getSettings, getToday } from "@/lib/settings";
import { reviewPeriod } from "@/lib/domain/periods";
import { isISODate } from "@/lib/domain/dates";
import { isUuid, sp, type SearchParams } from "@/lib/search-params";
import { PageHeader } from "@/components/shared/page-header";
import { Callout } from "@/components/shared/misc";
import { ReviewForm } from "@/components/performance/review-form";
import { fmtDate } from "@/lib/format";
import type { PerformanceReview } from "@/lib/types";

export const metadata: Metadata = { title: "Performance review" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireUser();
  const params = await searchParams;
  const supabase = await createClient();
  const settings = await getSettings();
  const managed = await getManagedUserIds(me);

  let existing: PerformanceReview | null = null;
  let employeeId: string;
  let type: "monthly" | "quarterly" | "annual";
  let start: string;
  let end: string;

  const id = sp(params, "id");
  if (isUuid(id)) {
    const { data } = await supabase.from("performance_reviews").select("*").eq("id", id).maybeSingle<PerformanceReview>();
    if (!data) notFound();
    existing = data;
    employeeId = data.employee_id;
    type = data.period_type;
    start = data.period_start;
    end = data.period_end;
  } else {
    const emp = sp(params, "employee");
    if (!isUuid(emp)) notFound();
    employeeId = emp;
    type = (["monthly", "quarterly", "annual"] as const).find((t) => t === sp(params, "type")) ?? "monthly";
    const anchor = sp(params, "anchor");
    const range = reviewPeriod(type, isISODate(anchor) ? anchor : await getToday(), settings.company.fiscal_year_start_month);
    start = range.from;
    end = range.to;
    const { data } = await supabase.from("performance_reviews").select("*").eq("employee_id", employeeId).eq("period_type", type).eq("period_start", start).maybeSingle<PerformanceReview>();
    if (data) redirect(`/performance/review?id=${data.id}`);
  }
  const isManagerOf = managed.has(employeeId) && employeeId !== me.id;
  if (!isManagerOf && employeeId !== me.id) redirect("/performance");
  if (!existing && !isManagerOf) redirect(`/performance/${employeeId}`);

  const [{ data: emp }, perf] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", employeeId).maybeSingle(),
    supabase.rpc("calc_employee_performance", { p_employee: employeeId, p_from: start, p_to: end }),
  ]);
  const live = perf.data?.[0] as { eligible_tasks: number; completion_rate: number | null; on_time_rate: number | null; quality_score: number | null } | undefined;
  // Finalized reviews show the stored (frozen) metrics; drafts preview with live metrics.
  const auto = existing && existing.status === "finalized"
    ? { eligible_tasks: existing.eligible_tasks, completion_rate: existing.completion_rate, on_time_rate: existing.on_time_rate, quality_score: existing.task_quality_score }
    : live ?? { eligible_tasks: 0, completion_rate: null, on_time_rate: null, quality_score: null };
  const readOnly = !isManagerOf || existing?.status === "finalized";

  return (
    <div className="space-y-4">
      <Link href={`/performance/${employeeId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Scorecard</Link>
      <PageHeader
        title={`${existing ? "Performance review" : "New performance review"} – ${emp?.full_name ?? ""}`}
        description={<span className="capitalize">{type} review · {fmtDate(start)} – {fmtDate(end)} {existing && `· ${existing.status}`}</span>}
      />
      {existing?.status === "finalized" && <Callout>This review was finalized on {fmtDate(existing.finalized_at)}. Its metrics are frozen{me.role === "admin" ? "; administrators can return it to draft to make corrections." : "."}</Callout>}
      <ReviewForm
        employee={{ id: employeeId, name: emp?.full_name ?? "" }}
        period={{ type, start, end }}
        auto={auto}
        existing={existing}
        weights={settings.kpi_weights}
        scale={settings.evaluation_scale.max}
        scaleLabels={settings.evaluation_scale.labels ?? {}}
        bands={settings.performance_bands}
        minTasks={settings.performance_rules.min_tasks_for_evaluation}
        readOnly={readOnly}
        isAdmin={me.role === "admin"}
      />
    </div>
  );
}
