"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { CheckCircle2, Circle, FolderPlus, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { projectSchema } from "@/lib/validation/schemas";
import { addMilestone, createProject, deleteMilestone, setMilestoneStatus, updateProject } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/shared/misc";
import { MultiSelect } from "@/components/shared/multi-select";
import { PRIORITY_LABELS, PROJECT_STATUS_LABELS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import type { Option } from "@/lib/queries/options";
import type { Milestone, Project } from "@/lib/types";

type In = z.input<typeof projectSchema>;
type Out = z.output<typeof projectSchema>;

export function ProjectFormDialog({ project, memberIds = [], people, departments }: {
  project?: Project; memberIds?: string[]; people: Option[]; departments: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { register, control, handleSubmit, setError, reset, formState: { errors } } = useForm<In, unknown, Out>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name ?? "", description: project?.description ?? "", owner_id: project?.owner_id ?? "",
      department_id: project?.department_id ?? "", start_date: project?.start_date ?? "", target_date: project?.target_date ?? "",
      status: project?.status ?? "planning", priority: project?.priority ?? "medium", remarks: project?.remarks ?? "", member_ids: memberIds,
    },
  });
  const submit = handleSubmit((v) =>
    start(async () => {
      const res = project ? await updateProject(project.id, v) : await createProject(v);
      if (!res.ok) {
        toast.error(res.error);
        Object.entries(res.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof In, { message: m?.[0] }));
        return;
      }
      toast.success(res.message ?? "Saved");
      setOpen(false);
      if (!project) {
        reset();
        const id = (res.data as { id: string } | undefined)?.id;
        if (id) return router.push(`/projects/${id}`);
      }
      router.refresh();
    }),
  );
  return (
    <>
      {project ? <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Pencil /> Edit</Button> : <Button onClick={() => setOpen(true)}><FolderPlus /> New project</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <DialogHeader><DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle></DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Project name *</Label>
              <Input id="p-name" {...register("name")} />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Description</Label>
              <Textarea id="p-desc" rows={3} {...register("description")} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-owner">Project owner</Label>
                <NativeSelect id="p-owner" {...register("owner_id")}>
                  <option value="">— None —</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-dept">Department</Label>
                <NativeSelect id="p-dept" {...register("department_id")}>
                  <option value="">— None —</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-start">Start date</Label>
                <Input id="p-start" type="date" {...register("start_date")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-target">Target completion</Label>
                <Input id="p-target" type="date" {...register("target_date")} />
                <FieldError message={errors.target_date?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-status">Status</Label>
                <NativeSelect id="p-status" {...register("status")}>
                  {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-priority">Priority</Label>
                <NativeSelect id="p-priority" {...register("priority")}>
                  {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </NativeSelect>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Team members</Label>
              <Controller control={control} name="member_ids" render={({ field }) => <MultiSelect options={people} value={field.value ?? []} onChange={field.onChange} maxHeight="max-h-32" />} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-remarks">Remarks</Label>
              <Textarea id="p-remarks" rows={2} {...register("remarks")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MilestoneList({ projectId, milestones, today, canManage }: { projectId: string; milestones: Milestone[]; today: string; canManage: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => ReturnType<typeof addMilestone>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      after?.();
      router.refresh();
    });
  return (
    <div className="space-y-3">
      {milestones.length === 0 && <p className="text-sm text-muted-foreground">No milestones yet.</p>}
      <ul className="space-y-2">
        {milestones.map((m) => {
          const delayed = m.status === "pending" && m.due_date < today;
          return (
            <li key={m.id} className="flex items-center gap-3 text-sm">
              <button disabled={!canManage || pending} onClick={() => run(() => setMilestoneStatus(m.id, m.status !== "completed"))} aria-label={m.status === "completed" ? "Mark pending" : "Mark completed"}>
                {m.status === "completed" ? <CheckCircle2 className="size-5 text-success" /> : <Circle className={`size-5 ${delayed ? "text-destructive" : "text-muted-foreground"}`} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={m.status === "completed" ? "text-muted-foreground line-through" : "font-medium"}>{m.title}</p>
                <p className={`text-xs ${delayed ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                  Due {fmtDate(m.due_date)}{delayed && " · Delayed"}{m.completed_at && ` · Done ${fmtDate(m.completed_at)}`}
                </p>
              </div>
              {canManage && <Button size="icon-sm" variant="ghost" aria-label="Delete milestone" onClick={() => confirm("Delete this milestone?") && run(() => deleteMilestone(m.id))}><Trash2 /></Button>}
            </li>
          );
        })}
      </ul>
      {canManage && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            run(() => addMilestone(projectId, { title: fd.get("title"), due_date: fd.get("due_date"), description: "" }), () => form.reset());
          }}
        >
          <Input name="title" placeholder="New milestone" required className="min-w-40 flex-1" />
          <Input name="due_date" type="date" required className="w-40" />
          <Button size="sm" variant="outline" disabled={pending}><Plus /> Add</Button>
        </form>
      )}
    </div>
  );
}
