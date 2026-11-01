"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { previewReview, kpiInsights, type Band } from "@/lib/domain/scoring";
import { deleteDraftReview, recalculateReview, reopenReview, saveReview } from "@/lib/actions/performance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Callout } from "@/components/shared/misc";
import { PerformanceBadge } from "@/components/shared/badges";
import { KpiBreakdown } from "./kpi-breakdown";
import type { KpiWeights, PerformanceReview } from "@/lib/types";

interface Auto { eligible_tasks: number; completion_rate: number | null; on_time_rate: number | null; quality_score: number | null }

function RatingPicker({ name, value, onChange, scale, labels }: { name: string; value: number | null; onChange: (v: number | null) => void; scale: number; labels: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={name}>
      {Array.from({ length: scale }, (_, i) => i + 1).map((r) => (
        <button key={r} type="button" role="radio" aria-checked={value === r} title={labels[String(r)]}
          onClick={() => onChange(value === r ? null : r)}
          className={`h-9 min-w-9 rounded-md border px-2 text-sm font-medium ${value === r ? "border-primary bg-primary text-white" : "bg-white hover:bg-muted"}`}>
          {r}
        </button>
      ))}
      {value !== null && <span className="self-center text-xs text-muted-foreground">{labels[String(value)]}</span>}
    </div>
  );
}

export function ReviewForm({ employee, period, auto, existing, weights, scale, scaleLabels, bands, minTasks, readOnly, isAdmin }: {
  employee: { id: string; name: string };
  period: { type: "monthly" | "quarterly" | "annual"; start: string; end: string };
  auto: Auto;
  existing: PerformanceReview | null;
  weights: KpiWeights;
  scale: number;
  scaleLabels: Record<string, string>;
  bands: Band[];
  minTasks: number;
  readOnly: boolean;
  isAdmin: boolean;
}) {
  const [quality, setQuality] = useState<number | null>(existing?.quality_rating ?? null);
  const [ownership, setOwnership] = useState<number | null>(existing?.ownership_rating ?? null);
  const [communication, setCommunication] = useState<number | null>(existing?.communication_rating ?? null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const w = existing?.weights ?? weights;
  const sc = existing?.rating_scale ?? scale;

  const preview = useMemo(() => previewReview({
    completionRate: auto.completion_rate, onTimeRate: auto.on_time_rate, taskQualityScore: auto.quality_score,
    qualityRating: quality, ownershipRating: ownership, communicationRating: communication,
    eligibleTasks: auto.eligible_tasks, scale: sc, weights: w, bands, minTasks,
  }), [auto, quality, ownership, communication, sc, w, bands, minTasks]);
  const insights = kpiInsights(preview.components);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const finalize = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "finalize";
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveReview({
        employee_id: employee.id, period_type: period.type, period_start: period.start, period_end: period.end,
        quality_rating: quality ?? "", ownership_rating: ownership ?? "", communication_rating: communication ?? "",
        strengths: fd.get("strengths"), improvements: fd.get("improvements"), manager_comments: fd.get("manager_comments"),
        action_plan: fd.get("action_plan"), finalize,
      }, existing?.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message ?? "Saved");
      if (!existing && res.data) router.replace(`/performance/review?id=${res.data.id}`);
      else router.refresh();
    });
  }
  const run = (fn: () => ReturnType<typeof reopenReview>, after?: () => void) => start(async () => {
    const res = await fn();
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? "Done");
    after ? after() : router.refresh();
  });

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>KPI breakdown</CardTitle>
              <p className="text-xs text-muted-foreground">Automatic metrics come from task records; manager ratings are entered below. Weights are frozen when the review is created.</p>
            </div>
            {existing?.status === "draft" && (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => recalculateReview(existing.id))}><RefreshCw /> Recalculate</Button>
            )}
          </CardHeader>
          <CardContent><KpiBreakdown components={preview.components} weights={w} eligible={auto.eligible_tasks} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Manager evaluation</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <fieldset disabled={readOnly} className="space-y-5">
              <div className="space-y-1.5">
                <Label>Quality & accuracy override <span className="font-normal text-muted-foreground">(optional – otherwise the average task rating{auto.quality_score !== null ? `, ${auto.quality_score}%` : ""} is used)</span></Label>
                <RatingPicker name="Quality" value={quality} onChange={setQuality} scale={sc} labels={scaleLabels} />
              </div>
              <div className="space-y-1.5">
                <Label>Ownership & initiative *</Label>
                <RatingPicker name="Ownership" value={ownership} onChange={setOwnership} scale={sc} labels={scaleLabels} />
              </div>
              <div className="space-y-1.5">
                <Label>Communication & coordination *</Label>
                <RatingPicker name="Communication" value={communication} onChange={setCommunication} scale={sc} labels={scaleLabels} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="strengths">Strengths</Label>
                  <Textarea id="strengths" name="strengths" rows={3} defaultValue={existing?.strengths ?? ""} placeholder={insights.strengths.length ? `Data suggests: ${insights.strengths.join(", ")}` : ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="improvements">Areas for improvement</Label>
                  <Textarea id="improvements" name="improvements" rows={3} defaultValue={existing?.improvements ?? ""} placeholder={insights.improvements.length ? `Data suggests: ${insights.improvements.join(", ")}` : ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="manager_comments">Manager&apos;s comments * <span className="font-normal text-muted-foreground">(required to finalize)</span></Label>
                  <Textarea id="manager_comments" name="manager_comments" rows={3} defaultValue={existing?.manager_comments ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="action_plan">Improvement action plan</Label>
                  <Textarea id="action_plan" name="action_plan" rows={3} defaultValue={existing?.action_plan ?? ""} />
                </div>
              </div>
            </fieldset>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="sticky top-20">
          <CardHeader><CardTitle>Overall rating</CardTitle><p className="text-xs text-muted-foreground">{employee.name} · {period.start} → {period.end}</p></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <span className="text-4xl font-semibold tabular-nums">{preview.score ?? "—"}</span>
              <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
            </div>
            <PerformanceBadge category={preview.category} provisional={preview.provisional} />
            {preview.warnings.length > 0 && (
              <Callout tone="warning" title="Provisional – incomplete data">
                <ul className="list-disc space-y-1 pl-4 text-xs">{preview.warnings.map((x) => <li key={x}>{x}</li>)}</ul>
              </Callout>
            )}
            <p className="text-[11px] text-muted-foreground">
              Preview calculated in the browser; the database recalculates and stores the official score when you save.
              A low task count is labelled “Insufficient data”, never as poor performance.
            </p>
            {!readOnly && (
              <div className="flex flex-col gap-2">
                <Button type="submit" value="draft" variant="outline" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save draft</Button>
                <Button type="submit" value="finalize" disabled={pending || ownership === null || communication === null}>Finalize & share with employee</Button>
                {existing?.status === "draft" && (
                  <Button type="button" variant="ghost" className="text-destructive" disabled={pending}
                    onClick={() => confirm("Delete this draft review?") && run(() => deleteDraftReview(existing.id), () => router.push(`/performance/${employee.id}`))}>
                    <Trash2 /> Delete draft
                  </Button>
                )}
              </div>
            )}
            {existing?.status === "finalized" && isAdmin && (
              <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => reopenReview(existing.id))}><Undo2 /> Return to draft (admin)</Button>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
