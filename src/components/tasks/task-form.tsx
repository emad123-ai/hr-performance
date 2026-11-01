"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { taskSchema } from "@/lib/validation/schemas";
import { createTask } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/shared/misc";
import { MultiSelect } from "@/components/shared/multi-select";
import { COMPLEXITY_LABELS, PRIORITY_LABELS, RECURRENCE_LABELS } from "@/lib/constants";
import type { CategoryOption, Option } from "@/lib/queries/options";

type FormIn = z.input<typeof taskSchema>;
type FormOut = z.output<typeof taskSchema>;

export interface TaskFormProps {
  options: { employees: Option[]; departments: Option[]; projects: Option[]; categories: CategoryOption[] };
  dependencyOptions?: Option[];
  defaults?: Partial<FormIn>;
  today: string;
  onDone?: (ids: string[]) => void;
  compact?: boolean;
}

export function TaskForm({ options, dependencyOptions, defaults, today, onDone, compact }: TaskFormProps) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "", description: "", assignee_ids: [], assignment_mode: "shared", start_date: today, due_date: today,
      priority: "medium", complexity: 2, estimated_hours: "", recurrence: "none", recurrence_end_date: "",
      department_id: "", project_id: "", category_id: "", parent_task_id: "", milestone_id: "", depends_on: [],
      ...defaults,
    },
  });
  const { register, handleSubmit, control, watch, formState: { errors } } = form;
  const assignees = watch("assignee_ids") ?? [];
  const recurrence = watch("recurrence");

  const groups = options.categories.reduce<Record<string, CategoryOption[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  const onSubmit = handleSubmit((values) =>
    start(async () => {
      const res = await createTask(values);
      if (!res.ok) {
        toast.error(res.error);
        Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) => form.setError(k as keyof FormIn, { message: v?.[0] }));
        return;
      }
      toast.success(res.message ?? "Task created");
      form.reset();
      if (onDone) onDone(res.data?.ids ?? []);
      else router.push(res.data?.ids.length === 1 ? `/tasks/${res.data.ids[0]}` : "/tasks");
    }),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="title">Task title *</Label>
        <Input id="title" {...register("title")} aria-invalid={!!errors.title} placeholder="e.g. Screen CVs for Finance Analyst role" />
        <FieldError message={errors.title?.message} />
      </div>
      {!compact && (
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={4} {...register("description")} placeholder="Scope, expected deliverable, acceptance criteria…" />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Assign to *</Label>
        <Controller
          control={control}
          name="assignee_ids"
          render={({ field }) => (
            <MultiSelect options={options.employees} value={field.value ?? []} onChange={field.onChange} placeholder="Find people…" invalid={!!errors.assignee_ids} />
          )}
        />
        <FieldError message={errors.assignee_ids?.message} />
        {assignees.length > 1 && (
          <div className="flex flex-wrap gap-4 pt-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" value="shared" {...register("assignment_mode")} /> One shared task
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" value="individual" {...register("assignment_mode")} /> Separate task for each person
            </label>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="start_date">Start date *</Label>
          <Input id="start_date" type="date" {...register("start_date")} aria-invalid={!!errors.start_date} />
          <FieldError message={errors.start_date?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="due_date">Due date *</Label>
          <Input id="due_date" type="date" {...register("due_date")} aria-invalid={!!errors.due_date} />
          <FieldError message={errors.due_date?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <NativeSelect id="priority" {...register("priority")}>
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category_id">Category</Label>
          <NativeSelect id="category_id" {...register("category_id")}>
            <option value="">— None —</option>
            {Object.entries(groups).map(([g, cats]) => (
              <optgroup key={g} label={g}>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </optgroup>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="estimated_hours">Estimated hours</Label>
          <Input id="estimated_hours" type="number" step="0.5" min="0" {...register("estimated_hours")} placeholder="e.g. 6" />
          <FieldError message={errors.estimated_hours?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="complexity">Complexity</Label>
          <NativeSelect id="complexity" {...register("complexity")}>
            {[1, 2, 3].map((c) => <option key={c} value={c}>{COMPLEXITY_LABELS[c]}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="department_id">Department / domain</Label>
          <NativeSelect id="department_id" {...register("department_id")}>
            <option value="">— None —</option>
            {options.departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project_id">Project</Label>
          <NativeSelect id="project_id" {...register("project_id")}>
            <option value="">— None —</option>
            {options.projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </NativeSelect>
        </div>
        {!compact && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="recurrence">Repeat</Label>
              <NativeSelect id="recurrence" {...register("recurrence")}>
                {Object.entries(RECURRENCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            </div>
            {recurrence !== "none" && (
              <div className="space-y-1.5">
                <Label htmlFor="recurrence_end_date">Repeat until (optional)</Label>
                <Input id="recurrence_end_date" type="date" {...register("recurrence_end_date")} />
                <FieldError message={errors.recurrence_end_date?.message} />
              </div>
            )}
          </>
        )}
      </div>

      {!compact && dependencyOptions && dependencyOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label>Depends on (must be finished first)</Label>
          <Controller
            control={control}
            name="depends_on"
            render={({ field }) => <MultiSelect options={dependencyOptions} value={field.value ?? []} onChange={field.onChange} placeholder="Find tasks…" maxHeight="max-h-32" />}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Create task
        </Button>
      </div>
    </form>
  );
}
