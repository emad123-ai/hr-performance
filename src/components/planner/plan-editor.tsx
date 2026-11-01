"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addPlanItem, carryOverPending, deletePlanItem, savePlan, updatePlanItem } from "@/lib/actions/planner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PLAN_STATUS_LABELS } from "@/lib/constants";
import type { ActionResult, DailyPlan, DailyPlanItem } from "@/lib/types";

export function PlanEditor({ date, plan, items, taskOptions }: {
  date: string;
  plan: DailyPlan | null;
  items: DailyPlanItem[];
  taskOptions: { id: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [assist, setAssist] = useState(plan?.assistance_needed ?? false);
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      if (res.message) toast.success(res.message);
      after?.();
      router.refresh();
    });

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Activities</CardTitle>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => carryOverPending(date))}><CopyPlus /> Carry over pending</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && <p className="text-sm text-muted-foreground">No activities planned yet. Add what you intend to deliver today.</p>}
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.title}</p>
                    {i.expected_deliverable && <p className="text-xs text-muted-foreground">Deliverable: {i.expected_deliverable}</p>}
                    {i.task_id && <a href={`/tasks/${i.task_id}`} className="text-xs text-info hover:underline">Linked task</a>}
                  </div>
                  <NativeSelect
                    aria-label="Status"
                    className="w-32"
                    defaultValue={i.status}
                    onChange={(e) => run(() => updatePlanItem(i.id, { status: e.target.value }))}
                  >
                    {Object.entries(PLAN_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </NativeSelect>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">Est {i.estimated_hours ?? "—"}h · Actual</span>
                    <Input
                      aria-label="Actual hours"
                      type="number" min={0} max={24} step={0.25}
                      defaultValue={i.actual_hours ?? ""}
                      className="h-8 w-20"
                      onBlur={(e) => e.target.value !== String(i.actual_hours ?? "") && run(() => updatePlanItem(i.id, { actual_hours: e.target.value }))}
                    />
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => run(() => deletePlanItem(i.id))}><Trash2 /></Button>
                </div>
                {(i.status === "blocked" || i.obstacle) && (
                  <Input
                    className="mt-2 h-8 text-sm"
                    placeholder="What is blocking this?"
                    defaultValue={i.obstacle ?? ""}
                    onBlur={(e) => e.target.value !== (i.obstacle ?? "") && run(() => updatePlanItem(i.id, { obstacle: e.target.value }))}
                  />
                )}
              </li>
            ))}
          </ul>
          <form
            className="grid gap-2 rounded-md border border-dashed p-3 md:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              run(() => addPlanItem(date, {
                title: fd.get("title"), task_id: fd.get("task_id"), expected_deliverable: fd.get("expected_deliverable"),
                estimated_hours: fd.get("estimated_hours"), actual_hours: "", status: "planned", obstacle: "",
              }), () => form.reset());
            }}
          >
            <Input name="title" placeholder="Activity *" required className="md:col-span-2" />
            <NativeSelect name="task_id" aria-label="Link to task" className="md:col-span-2">
              <option value="">Link to a task (optional)</option>
              {taskOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </NativeSelect>
            <Input name="estimated_hours" type="number" min={0} max={24} step={0.25} placeholder="Est. hours" />
            <Button disabled={pending}><Plus /> Add</Button>
            <Input name="expected_deliverable" placeholder="Expected deliverable" className="md:col-span-6" />
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader><CardTitle>Notes & obstacles</CardTitle></CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
              const fd = new FormData(e.currentTarget);
              run(() => savePlan({
                plan_date: date, notes: fd.get("notes"), obstacles: fd.get("obstacles"),
                assistance_needed: assist, assistance_details: fd.get("assistance_details"),
              }, submitter?.value === "submit"));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={3} defaultValue={plan?.notes ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obstacles">Obstacles</Label>
              <Textarea id="obstacles" name="obstacles" rows={2} defaultValue={plan?.obstacles ?? ""} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={assist} onChange={(e) => setAssist(e.target.checked)} /> I need assistance
            </label>
            {assist && <Textarea name="assistance_details" rows={2} placeholder="What help do you need, and from whom?" defaultValue={plan?.assistance_details ?? ""} />}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" value="save" variant="outline" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
              <Button type="submit" value="submit" disabled={pending}><Send /> {plan?.submitted_at ? "Re-submit report" : "Submit daily report"}</Button>
            </div>
            {plan?.submitted_at && <p className="text-xs text-muted-foreground">Last submitted {new Date(plan.submitted_at).toLocaleString()}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
