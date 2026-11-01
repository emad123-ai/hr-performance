"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect, type MultiOption } from "@/components/shared/multi-select";
import { DELAY_CAUSE_LABELS } from "@/lib/constants";
import {
  cancelTask, changeDeadline, escalateTask, reassignTask, reopenTask, reviewTask, setDelayCause, submitTask, updateProgress,
} from "@/lib/actions/tasks";
import type { ActionResult, TaskStatus } from "@/lib/types";

interface BaseProps {
  taskId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useRun(onOpenChange: (o: boolean) => void) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      onOpenChange(false);
      router.refresh();
    });
  return { pending, run };
}

function Footer({ pending, label, onCancel, variant, disabled }: { pending: boolean; label: string; onCancel: () => void; variant?: "default" | "destructive" | "success"; disabled?: boolean }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant={variant} disabled={pending || disabled}>
        {pending && <Loader2 className="animate-spin" />} {label}
      </Button>
    </DialogFooter>
  );
}

export function ProgressDialog({ taskId, open, onOpenChange, current, initialStatus }: BaseProps & { current: number; initialStatus?: TaskStatus }) {
  const { pending, run } = useRun(onOpenChange);
  const [pct, setPct] = useState(current);
  const [status, setStatus] = useState<"not_started" | "in_progress" | "blocked">(
    initialStatus === "blocked" || initialStatus === "not_started" ? initialStatus : "in_progress",
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => updateProgress(taskId, { percentage: pct, status, note: fd.get("note"), hours_spent: fd.get("hours_spent") }));
          }}
        >
          <DialogHeader>
            <DialogTitle>Update progress</DialogTitle>
            <DialogDescription>Progress updates are recorded in the task history and visible to your supervisor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pct">Completion: {pct}%</Label>
            <input id="pct" type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="st">Status</Label>
              <NativeSelect id="st" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hours_spent">Hours spent (this update)</Label>
              <Input id="hours_spent" name="hours_spent" type="number" min={0} max={24} step={0.25} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">{status === "blocked" ? "Describe the blocker *" : "Progress note"}</Label>
            <Textarea id="note" name="note" rows={3} required={status === "blocked"} placeholder={status === "blocked" ? "What is blocking you and who can help?" : "What was done?"} />
          </div>
          <Footer pending={pending} label="Save update" onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SubmitDialog({ taskId, open, onOpenChange }: BaseProps) {
  const { pending, run } = useRun(onOpenChange);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => submitTask(taskId, String(fd.get("note") ?? ""), String(fd.get("evidence") ?? "")));
          }}
        >
          <DialogHeader>
            <DialogTitle>Submit for review</DialogTitle>
            <DialogDescription>Your supervisor will be notified. Attach supporting files on the task page if needed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="note">Summary of completed work</Label>
            <Textarea id="note" name="note" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evidence">Supporting evidence (links, references)</Label>
            <Textarea id="evidence" name="evidence" rows={2} placeholder="e.g. shared-drive link, document reference numbers" />
          </div>
          <Footer pending={pending} label="Submit" onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewDialog({ taskId, open, onOpenChange, mode, scale }: BaseProps & { mode: "approve" | "request_changes"; scale: number }) {
  const { pending, run } = useRun(onOpenChange);
  const [quality, setQuality] = useState<number | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => reviewTask(taskId, { decision: mode, quality: mode === "approve" ? quality ?? "" : "", feedback: fd.get("feedback") }));
          }}
        >
          <DialogHeader>
            <DialogTitle>{mode === "approve" ? "Approve & complete task" : "Request changes"}</DialogTitle>
            <DialogDescription>
              {mode === "approve"
                ? "The quality rating feeds the employee's Quality & Accuracy KPI."
                : "The task returns to the assignee as In Progress with your feedback."}
            </DialogDescription>
          </DialogHeader>
          {mode === "approve" && (
            <div className="space-y-1.5">
              <Label>Quality rating *</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Quality rating">
                {Array.from({ length: scale }, (_, i) => i + 1).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={quality === r}
                    onClick={() => setQuality(r)}
                    className={`size-9 rounded-md border text-sm font-medium ${quality === r ? "border-primary bg-primary text-white" : "bg-white hover:bg-muted"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">1 = poor · {scale} = outstanding</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="feedback">{mode === "approve" ? "Supervisor feedback" : "What needs to change? *"}</Label>
            <Textarea id="feedback" name="feedback" rows={3} required={mode === "request_changes"} />
          </div>
          <Footer pending={pending} disabled={mode === "approve" && quality === null} label={mode === "approve" ? "Approve" : "Send back"} variant={mode === "approve" ? "success" : "default"} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReasonDialog({
  taskId, open, onOpenChange, kind,
}: BaseProps & { kind: "reopen" | "cancel" | "escalate" }) {
  const { pending, run } = useRun(onOpenChange);
  const copy = {
    reopen: { title: "Reopen task", desc: "The completion record stays in the history. A reason is required.", label: "Reopen", fn: reopenTask },
    cancel: { title: "Cancel task", desc: "Cancelled tasks are excluded from performance calculations.", label: "Cancel task", fn: cancelTask },
    escalate: { title: "Escalate to HR management", desc: "All administrators will be notified.", label: "Escalate", fn: escalateTask },
  }[kind];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
            run(() => copy.fn(taskId, reason));
          }}
        >
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.desc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea id="reason" name="reason" rows={3} required minLength={3} />
          </div>
          <Footer pending={pending} label={copy.label} variant={kind === "cancel" ? "destructive" : "default"} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeadlineDialog({ taskId, open, onOpenChange, currentDue }: BaseProps & { currentDue: string }) {
  const { pending, run } = useRun(onOpenChange);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => changeDeadline(taskId, { due_date: fd.get("due_date"), reason: fd.get("reason"), cause: fd.get("cause") }));
          }}
        >
          <DialogHeader>
            <DialogTitle>Change deadline</DialogTitle>
            <DialogDescription>
              The original deadline is preserved. Approved extensions are not counted as late delivery; classify who caused the delay.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="due_date">New due date *</Label>
              <Input id="due_date" name="due_date" type="date" defaultValue={currentDue} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cause">Reason category</Label>
              <NativeSelect id="cause" name="cause" defaultValue="none">
                {Object.entries(DELAY_CAUSE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason for the change *</Label>
            <Textarea id="reason" name="reason" rows={3} required minLength={3} />
          </div>
          <Footer pending={pending} label="Change deadline" onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DelayCauseDialog({ taskId, open, onOpenChange, current }: BaseProps & { current: string }) {
  const { pending, run } = useRun(onOpenChange);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => setDelayCause(taskId, String(fd.get("cause")), String(fd.get("reason") ?? "")));
          }}
        >
          <DialogHeader>
            <DialogTitle>Classify delay</DialogTitle>
            <DialogDescription>
              Delays caused by external dependencies or management are excluded from the employee&apos;s on-time and completion penalties.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cause">Delay cause</Label>
            <NativeSelect id="cause" name="cause" defaultValue={current}>
              {Object.entries(DELAY_CAUSE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Explanation *</Label>
            <Textarea id="reason" name="reason" rows={3} required minLength={3} />
          </div>
          <Footer pending={pending} label="Save" onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReassignDialog({ taskId, open, onOpenChange, people, current }: BaseProps & { people: MultiOption[]; current: string[] }) {
  const { pending, run } = useRun(onOpenChange);
  const [ids, setIds] = useState<string[]>(current);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
            run(() => reassignTask(taskId, ids, reason));
          }}
        >
          <DialogHeader>
            <DialogTitle>Reassign task</DialogTitle>
            <DialogDescription>Previous and new assignees are notified; the change is kept in the history.</DialogDescription>
          </DialogHeader>
          <MultiSelect options={people} value={ids} onChange={setIds} placeholder="Find people…" />
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea id="reason" name="reason" rows={2} required minLength={3} />
          </div>
          <Footer pending={pending} disabled={ids.length === 0} label="Reassign" onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
