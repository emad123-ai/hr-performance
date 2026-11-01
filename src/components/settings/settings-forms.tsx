"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  clearDemoData, deleteReference, runMaintenance, saveBands, saveDesignations, saveEvaluationSettings, saveLabels, saveReference, saveSetting, toggleReferenceActive,
} from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/shared/misc";
import type { ActionResult, KpiWeights } from "@/lib/types";

function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message ?? "Saved");
      after?.();
      router.refresh();
    });
  return { pending, run };
}

function SaveButton({ pending, label = "Save" }: { pending: boolean; label?: string }) {
  return <Button disabled={pending}>{pending && <Loader2 className="animate-spin" />} {label}</Button>;
}

const TIMEZONES = ["Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata", "Asia/Dhaka", "Asia/Singapore", "Europe/London", "Europe/Berlin", "Africa/Cairo", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "UTC"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CompanyForm({ value }: { value: { name: string; timezone: string; fiscal_year_start_month: number; logo_url: string | null } }) {
  const { pending, run } = useAction();
  return (
    <form className="grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      run(() => saveSetting("company", Object.fromEntries(fd)));
    }}>
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-name">Company name</Label><Input id="c-name" name="name" defaultValue={value.name} required /></div>
      <div className="space-y-1.5">
        <Label htmlFor="c-tz">Time zone (used for “today”, overdue and deadlines)</Label>
        <NativeSelect id="c-tz" name="timezone" defaultValue={value.timezone}>
          {[...new Set([value.timezone, ...TIMEZONES])].map((t) => <option key={t} value={t}>{t}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-fy">Fiscal year starts</Label>
        <NativeSelect id="c-fy" name="fiscal_year_start_month" defaultValue={value.fiscal_year_start_month}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-logo">Logo URL (optional)</Label><Input id="c-logo" name="logo_url" type="url" defaultValue={value.logo_url ?? ""} /></div>
      <div><SaveButton pending={pending} /></div>
    </form>
  );
}

export function KpiWeightsForm({ value }: { value: KpiWeights }) {
  const [w, setW] = useState(value);
  const { pending, run } = useAction();
  const total = Object.values(w).reduce((a, b) => a + Number(b || 0), 0);
  const labels: Record<keyof KpiWeights, string> = { completion: "Task completion rate", on_time: "On-time delivery", quality: "Quality & accuracy", ownership: "Ownership & initiative", communication: "Communication & coordination" };
  return (
    <form className="max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveSetting("kpi_weights", w)); }}>
      {(Object.keys(labels) as (keyof KpiWeights)[]).map((k) => (
        <div key={k} className="flex items-center gap-3">
          <Label htmlFor={`w-${k}`} className="flex-1">{labels[k]}</Label>
          <Input id={`w-${k}`} type="number" min={0} max={100} className="w-24 text-right" value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      ))}
      <p className={`text-sm font-medium ${total === 100 ? "text-success" : "text-destructive"}`}>Total: {total}% {total !== 100 && "(must be 100)"}</p>
      <p className="text-xs text-muted-foreground">New weights apply to reviews created from now on; existing reviews keep the weights they were created with.</p>
      <SaveButton pending={pending} />
    </form>
  );
}

export function EvaluationForm({ scale, labels, rules }: { scale: number; labels: Record<string, string>; rules: { min_tasks_for_evaluation: number; default_estimated_hours: number } }) {
  const [max, setMax] = useState(scale);
  const [l, setL] = useState(labels);
  const { pending, run } = useAction();
  return (
    <form className="max-w-xl space-y-4" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      run(() => saveEvaluationSettings({ max, min_tasks_for_evaluation: fd.get("min_tasks"), default_estimated_hours: fd.get("default_hours") }, l));
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5"><Label htmlFor="ev-max">Rating scale 1 to</Label><Input id="ev-max" type="number" min={3} max={10} value={max} onChange={(e) => setMax(Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label htmlFor="ev-min">Min. tasks for a valid score</Label><Input id="ev-min" name="min_tasks" type="number" min={1} max={50} defaultValue={rules.min_tasks_for_evaluation} /></div>
        <div className="space-y-1.5"><Label htmlFor="ev-def">Default estimate (h)</Label><Input id="ev-def" name="default_hours" type="number" min={0.5} step={0.5} defaultValue={rules.default_estimated_hours} /></div>
      </div>
      <div className="space-y-2">
        <Label>Rating labels</Label>
        {Array.from({ length: Math.min(Math.max(max, 3), 10) }, (_, i) => String(i + 1)).map((k) => (
          <div key={k} className="flex items-center gap-2"><span className="w-6 text-sm tabular-nums">{k}</span><Input value={l[k] ?? ""} onChange={(e) => setL({ ...l, [k]: e.target.value })} placeholder="Label" /></div>
        ))}
      </div>
      <SaveButton pending={pending} />
    </form>
  );
}

export function BandsForm({ value }: { value: { min: number; label: string }[] }) {
  const [bands, setBands] = useState(value);
  const { pending, run } = useAction();
  return (
    <form className="max-w-md space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => saveBands(bands)); }}>
      {bands.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input type="number" min={0} max={100} className="w-20" value={b.min} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)))} aria-label="Minimum score" />
          <span className="text-sm text-muted-foreground">and above →</span>
          <Input value={b.label} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Category label" />
        </div>
      ))}
      <SaveButton pending={pending} />
    </form>
  );
}

export function WorkingTimeForm({ value, workload }: { value: { working_days: number[]; hours_per_day: number }; workload: { horizon_days: number; underutilized_below: number; balanced_up_to: number; high_up_to: number } }) {
  const [days, setDays] = useState(value.working_days);
  const { pending, run } = useAction();
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveSetting("working_time", { working_days: days, hours_per_day: fd.get("hours") }));
      }}>
        <h3 className="font-medium">Working days & hours</h3>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={days.includes(i + 1)} onChange={(e) => setDays(e.target.checked ? [...days, i + 1].sort() : days.filter((x) => x !== i + 1))} /> {d}
            </label>
          ))}
        </div>
        <div className="space-y-1.5"><Label htmlFor="wt-h">Working hours per day</Label><Input id="wt-h" name="hours" type="number" min={1} max={24} step={0.5} defaultValue={value.hours_per_day} className="w-32" /></div>
        <SaveButton pending={pending} />
      </form>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveSetting("workload", Object.fromEntries(fd)));
      }}>
        <h3 className="font-medium">Workload thresholds</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="wl-h">Horizon (days)</Label><Input id="wl-h" name="horizon_days" type="number" min={5} max={60} defaultValue={workload.horizon_days} /></div>
          <div className="space-y-1.5"><Label htmlFor="wl-u">Underutilized below (%)</Label><Input id="wl-u" name="underutilized_below" type="number" defaultValue={workload.underutilized_below} /></div>
          <div className="space-y-1.5"><Label htmlFor="wl-b">Balanced up to (%)</Label><Input id="wl-b" name="balanced_up_to" type="number" defaultValue={workload.balanced_up_to} /></div>
          <div className="space-y-1.5"><Label htmlFor="wl-hi">High workload up to (%)</Label><Input id="wl-hi" name="high_up_to" type="number" defaultValue={workload.high_up_to} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Above the “high” threshold an employee is shown as Overloaded.</p>
        <SaveButton pending={pending} />
      </form>
    </div>
  );
}

export function RemindersForm({ value }: { value: { days_before_due: number[]; notify_overdue: boolean; notify_milestones: boolean } }) {
  const { pending, run } = useAction();
  const [overdue, setOverdue] = useState(value.notify_overdue);
  const [ms, setMs] = useState(value.notify_milestones);
  return (
    <form className="max-w-xl space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const days = String(new FormData(e.currentTarget).get("days") ?? "").split(",").map((x) => x.trim()).filter(Boolean).map(Number);
      run(() => saveSetting("reminders", { days_before_due: days, notify_overdue: overdue, notify_milestones: ms }));
    }}>
      <div className="space-y-1.5">
        <Label htmlFor="rem-days">Remind assignees this many days before the deadline (comma separated)</Label>
        <Input id="rem-days" name="days" defaultValue={value.days_before_due.join(", ")} placeholder="1, 3" />
        <p className="text-xs text-muted-foreground">A “due today” reminder is always sent. Checks run hourly via pg_cron (and daily via the optional Vercel cron).</p>
      </div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Alert assignees and supervisors when a task becomes overdue</label>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={ms} onChange={(e) => setMs(e.target.checked)} /> Alert project owners about delayed milestones</label>
      <SaveButton pending={pending} />
    </form>
  );
}

export function LabelsForm({ priorities, statuses }: { priorities: Record<string, { label: string; description: string; target_days: number }>; statuses: Record<string, { label: string; color: string }> }) {
  const [p, setP] = useState(priorities);
  const [s, setS] = useState(statuses);
  const { pending, run } = useAction();
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => saveLabels("priorities", p)); }}>
        <h3 className="font-medium">Priority definitions</h3>
        {Object.entries(p).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[6rem_1fr_5rem] items-center gap-2">
            <Input value={v.label} onChange={(e) => setP({ ...p, [k]: { ...v, label: e.target.value } })} aria-label={`${k} label`} />
            <Input value={v.description} onChange={(e) => setP({ ...p, [k]: { ...v, description: e.target.value } })} aria-label={`${k} description`} />
            <Input type="number" value={v.target_days} onChange={(e) => setP({ ...p, [k]: { ...v, target_days: Number(e.target.value) } })} aria-label={`${k} target days`} title="Target days" />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Label · meaning · target turnaround (days). Shown to staff as guidance.</p>
        <SaveButton pending={pending} />
      </form>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => saveLabels("statuses", s)); }}>
        <h3 className="font-medium">Status configuration</h3>
        {Object.entries(s).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <code className="w-28 text-xs text-muted-foreground">{k}</code>
            <Input value={v.label} onChange={(e) => setS({ ...s, [k]: { ...v, label: e.target.value } })} aria-label={`${k} label`} />
            <input type="color" value={v.color} onChange={(e) => setS({ ...s, [k]: { ...v, color: e.target.value } })} className="h-9 w-12 rounded border" aria-label={`${k} colour`} />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">The workflow states themselves are fixed (they drive permissions and calculations); labels and colours are configurable.</p>
        <SaveButton pending={pending} />
      </form>
    </div>
  );
}

export function DesignationsForm({ value }: { value: string[] }) {
  const { pending, run } = useAction();
  return (
    <form className="max-w-xl space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const list = String(new FormData(e.currentTarget).get("list") ?? "").split("\n").map((x) => x.trim());
      run(() => saveDesignations(list));
    }}>
      <Label htmlFor="desig">Designations (one per line)</Label>
      <Textarea id="desig" name="list" rows={8} defaultValue={value.join("\n")} />
      <SaveButton pending={pending} />
    </form>
  );
}

interface RefRow { id: string; name: string; [k: string]: unknown }
type Field = { key: string; label: string; type?: "text" | "select" | "color" | "textarea"; options?: { id: string; label: string }[] };

export function ReferenceManager({ table, rows, fields, title, canToggle }: { table: "departments" | "teams" | "categories"; rows: RefRow[]; fields: Field[]; title: string; canToggle?: boolean }) {
  const [editing, setEditing] = useState<RefRow | "new" | null>(null);
  const { pending, run } = useAction();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{title}</h3>
        <Button size="sm" onClick={() => setEditing("new")}><Plus /> Add</Button>
      </div>
      <ul className="divide-y rounded-md border bg-white">
        {rows.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nothing yet.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
            {"color" in r && <span className="size-3 rounded-full" style={{ background: String(r.color) }} />}
            <span className={`flex-1 ${r.is_active === false ? "text-muted-foreground line-through" : "font-medium"}`}>
              {"group_name" in r ? `${r.group_name} · ` : ""}{r.name}{r.code ? <span className="ml-1 text-xs text-muted-foreground">({String(r.code)})</span> : null}
            </span>
            {r.is_demo === true && <Badge className="text-[10px]">Demo</Badge>}
            <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(r)}><Pencil /></Button>
            {canToggle && <Button size="icon-sm" variant="ghost" aria-label={r.is_active === false ? "Activate" : "Deactivate"} disabled={pending} onClick={() => run(() => toggleReferenceActive(table as "departments" | "categories", r.id, r.is_active === false))}><Power /></Button>}
            <Button size="icon-sm" variant="ghost" aria-label="Delete" disabled={pending} onClick={() => confirm(`Delete “${r.name}”?`) && run(() => deleteReference(table, r.id))}><Trash2 /></Button>
          </li>
        ))}
      </ul>
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <form className="space-y-3" onSubmit={(e) => {
              e.preventDefault();
              const fd = Object.fromEntries(new FormData(e.currentTarget));
              run(() => saveReference(table, fd, editing === "new" ? undefined : editing.id), () => setEditing(null));
            }}>
              <DialogHeader><DialogTitle>{editing === "new" ? "Add" : "Edit"} {title.toLowerCase().replace(/s$/, "")}</DialogTitle></DialogHeader>
              {fields.map((f) => {
                const dv = editing === "new" ? (f.type === "color" ? "#2563eb" : "") : String(editing[f.key] ?? "");
                return (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={`rf-${f.key}`}>{f.label}</Label>
                    {f.type === "select" ? (
                      <NativeSelect id={`rf-${f.key}`} name={f.key} defaultValue={dv}>
                        <option value="">— None —</option>
                        {f.options?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </NativeSelect>
                    ) : f.type === "textarea" ? <Textarea id={`rf-${f.key}`} name={f.key} defaultValue={dv} rows={2} />
                      : <Input id={`rf-${f.key}`} name={f.key} type={f.type === "color" ? "color" : "text"} defaultValue={dv} required={f.key === "name" || f.key === "group_name"} className={f.type === "color" ? "h-10 w-20 p-1" : ""} />}
                  </div>
                );
              })}
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><SaveButton pending={pending} /></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function MaintenancePanel({ hasDemo, hasServiceKey }: { hasDemo: boolean; hasServiceKey: boolean }) {
  const { pending, run } = useAction();
  const [confirmText, setConfirmText] = useState("");
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium">Run scheduled jobs now</h3>
        <p className="text-sm text-muted-foreground">These normally run automatically (pg_cron hourly/daily). Running them manually is safe – they are idempotent.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={() => run(() => runMaintenance("deadlines"))}>Check deadlines & send reminders</Button>
          <Button variant="outline" disabled={pending} onClick={() => run(() => runMaintenance("workload"))}>Record workload snapshot</Button>
          <Button variant="outline" disabled={pending} onClick={() => run(() => runMaintenance("metrics"))}>Store last month&apos;s performance metrics</Button>
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">Data export</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href="/api/reports/employees">Employees (CSV)</a></Button>
          <Button variant="outline" asChild><a href="/api/reports/pending-unresolved">Open tasks (CSV)</a></Button>
          <Button variant="outline" asChild><a href="/api/reports/task-completion?period=this_year">Completed tasks this year (CSV)</a></Button>
          <Button variant="outline" asChild><a href="/api/reports/project-progress">Projects (CSV)</a></Button>
        </div>
        <p className="text-xs text-muted-foreground">For a full backup use Supabase → Database → Backups (Pro) or <code>pg_dump</code> with your connection string (free).</p>
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">Demonstration data</h3>
        {!hasDemo ? <p className="text-sm text-muted-foreground">No demo data is loaded.</p> : (
          <Callout tone="warning" title="Remove demo data before going live">
            <p className="mb-2">Deletes every record flagged as demo (tasks, projects, plans, reviews, demo departments/teams) and the 7 demo user accounts. Configuration and real records are kept. Create your own administrator account first.</p>
            {!hasServiceKey && <p className="mb-2 font-medium">SUPABASE_SERVICE_ROLE_KEY is not configured on the server, so this cannot run.</p>}
            <div className="flex flex-wrap gap-2">
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='Type "DELETE DEMO DATA"' className="max-w-xs bg-white" />
              <Button variant="destructive" disabled={pending || confirmText !== "DELETE DEMO DATA" || !hasServiceKey} onClick={() => run(() => clearDemoData(confirmText))}>Delete demo data</Button>
            </div>
          </Callout>
        )}
      </div>
    </div>
  );
}
