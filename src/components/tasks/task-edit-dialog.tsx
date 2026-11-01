"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { taskEditSchema } from "@/lib/validation/schemas";
import { updateTaskDetails } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/shared/misc";
import { COMPLEXITY_LABELS, PRIORITY_LABELS } from "@/lib/constants";
import type { CategoryOption, Option } from "@/lib/queries/options";
import type { Priority } from "@/lib/types";

export interface EditableTask {
  id: string;
  title: string;
  description: string | null;
  department_id: string | null;
  project_id: string | null;
  category_id: string | null;
  priority: Priority;
  complexity: number;
  estimated_hours: number | null;
  start_date: string;
}

type In = z.input<typeof taskEditSchema>;
type Out = z.output<typeof taskEditSchema>;

export function TaskEditDialog({
  task, options, open, onOpenChange,
}: { task: EditableTask; options: { departments: Option[]; projects: Option[]; categories: CategoryOption[] }; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<In, unknown, Out>({
    resolver: zodResolver(taskEditSchema),
    defaultValues: {
      title: task.title, description: task.description ?? "", department_id: task.department_id ?? "", project_id: task.project_id ?? "",
      category_id: task.category_id ?? "", priority: task.priority, complexity: task.complexity,
      estimated_hours: task.estimated_hours ?? "", start_date: task.start_date,
    },
  });
  const submit = handleSubmit((v) =>
    start(async () => {
      const res = await updateTaskDetails(task.id, v);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Task updated – changes recorded in history");
      onOpenChange(false);
      router.refresh();
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Edit task details</DialogTitle>
            <DialogDescription>Every change is logged with the previous value. Deadlines and status have their own workflow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="e-title">Title</Label>
            <Input id="e-title" {...register("title")} />
            <FieldError message={errors.title?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-desc">Description</Label>
            <Textarea id="e-desc" rows={4} {...register("description")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-pr">Priority</Label>
              <NativeSelect id="e-pr" {...register("priority")}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-cx">Complexity</Label>
              <NativeSelect id="e-cx" {...register("complexity")}>
                {[1, 2, 3].map((c) => <option key={c} value={c}>{COMPLEXITY_LABELS[c]}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-est">Estimated hours</Label>
              <Input id="e-est" type="number" step="0.5" min="0" {...register("estimated_hours")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-start">Start date</Label>
              <Input id="e-start" type="date" {...register("start_date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-dept">Department</Label>
              <NativeSelect id="e-dept" {...register("department_id")}>
                <option value="">— None —</option>
                {options.departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-proj">Project</Label>
              <NativeSelect id="e-proj" {...register("project_id")}>
                <option value="">— None —</option>
                {options.projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-cat">Category</Label>
            <NativeSelect id="e-cat" {...register("category_id")}>
              <option value="">— None —</option>
              {options.categories.map((c) => <option key={c.id} value={c.id}>{c.group} · {c.label}</option>)}
            </NativeSelect>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
