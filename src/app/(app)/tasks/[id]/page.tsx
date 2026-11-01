import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Plus, Repeat } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFormOptions } from "@/lib/queries/options";
import { canManageTask, getManagedUserIds } from "@/lib/queries/people";
import { openTaskOptions } from "@/lib/queries/tasks";
import { getSettings } from "@/lib/settings";
import { isUuid } from "@/lib/search-params";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DemoBadge, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { Callout } from "@/components/shared/misc";
import { TaskActionBar } from "@/components/tasks/task-action-bar";
import { TaskActivityTimeline } from "@/components/tasks/task-activity";
import { AttachmentPanel, CommentThread, DependencyPanel } from "@/components/tasks/task-panels";
import { COMPLEXITY_LABELS, DELAY_CAUSE_LABELS, RECURRENCE_LABELS } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtHours } from "@/lib/format";
import type { TaskActivity, TaskAttachment, TaskComment, TaskOverview } from "@/lib/types";

export const metadata: Metadata = { title: "Task" };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const me = await requireUser();
  const supabase = await createClient();
  const { data: task } = await supabase.from("task_overview").select("*").eq("id", id).maybeSingle<TaskOverview>();
  if (!task) notFound(); // also when RLS hides it

  const [comments, attachments, activity, deps, subtasks, parent, settings, managed] = await Promise.all([
    supabase.from("task_comments").select("*, author:profiles(full_name)").eq("task_id", id).order("created_at"),
    supabase.from("task_attachments").select("*, uploader:profiles(full_name)").eq("task_id", id).order("created_at", { ascending: false }),
    supabase.from("task_activity_logs").select("*, actor:profiles(full_name)").eq("task_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("task_dependencies").select("depends_on_id").eq("task_id", id),
    supabase.from("task_overview").select("id, task_code, title, effective_status, completion_percentage, assignee_names").eq("parent_task_id", id).order("due_date"),
    task.parent_task_id ? supabase.from("tasks").select("id, task_code, title").eq("id", task.parent_task_id).maybeSingle() : Promise.resolve({ data: null }),
    getSettings(),
    getManagedUserIds(me),
  ]);
  const depIds = (deps.data ?? []).map((d) => d.depends_on_id as string);
  const { data: depTasks } = depIds.length
    ? await supabase.from("task_overview").select("id, task_code, title, effective_status").in("id", depIds)
    : { data: [] };

  const isAssignee = task.assignee_ids.includes(me.id);
  const canManage = canManageTask(me, task, managed);
  const options = canManage ? await getFormOptions(me) : null;
  const depOptions = canManage ? await openTaskOptions() : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <Link href={isAssignee && me.role === "employee" ? "/tasks/my" : "/tasks"} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-no-print>
          <ArrowLeft className="size-4" /> Back to tasks
        </Link>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{task.task_code}</span>
              <StatusBadge status={task.effective_status} />
              {task.is_overdue && task.status !== "not_started" && <StatusBadge status={task.status} />}
              <PriorityBadge priority={task.priority} />
              {task.recurrence !== "none" && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Repeat className="size-3" /> {RECURRENCE_LABELS[task.recurrence]}</span>}
              {task.is_demo && <DemoBadge />}
            </div>
            <h1 className="text-xl font-semibold md:text-2xl">{task.title}</h1>
            {parent.data && (
              <p className="text-sm text-muted-foreground">Subtask of <Link className="text-info hover:underline" href={`/tasks/${parent.data.id}`}>{parent.data.task_code} · {parent.data.title}</Link></p>
            )}
          </div>
          <TaskActionBar
            task={task}
            role={me.role}
            isAssignee={isAssignee}
            canManage={canManage}
            scale={settings.evaluation_scale.max}
            people={options?.employees ?? []}
            editOptions={options ?? { departments: [], projects: [], categories: [] }}
          />
        </div>
      </div>

      {task.is_overdue && (
        <Callout tone="danger" title={`Overdue by ${task.days_overdue} day(s)`}>
          Was due on {fmtDate(task.due_date)}.{task.delay_cause !== "none" && ` Delay classified as: ${DELAY_CAUSE_LABELS[task.delay_cause]}.`}
        </Callout>
      )}
      {task.status === "blocked" && task.blocker_reason && <Callout tone="warning" title="Blocked">{task.blocker_reason}</Callout>}
      {task.open_dependency_count > 0 && task.status !== "completed" && (
        <Callout tone="warning">Waiting on {task.open_dependency_count} unfinished dependency task(s) – it cannot be submitted until they are done.</Callout>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardContent className="space-y-5 pt-5">
              <div>
                <div className="mb-1 flex justify-between text-sm"><span className="font-medium">Progress</span><span className="tabular-nums">{task.completion_percentage}%</span></div>
                <Progress value={task.completion_percentage} indicatorClassName={task.is_overdue ? "bg-destructive" : task.status === "completed" ? "bg-success" : undefined} />
              </div>
              {task.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{task.description}</p> : <p className="text-sm text-muted-foreground">No description.</p>}
              <dl className="grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-3">
                <Detail label="Assigned to">{task.assignee_names.join(", ") || "—"}</Detail>
                <Detail label="Assigned by">{task.assigned_by_name ?? "—"}</Detail>
                <Detail label="Assigned on">{fmtDateTime(task.assigned_at)}</Detail>
                <Detail label="Start date">{fmtDate(task.start_date)}</Detail>
                <Detail label="Due date">
                  <span className={task.is_overdue ? "font-medium text-destructive" : ""}>{fmtDate(task.due_date)}</span>
                  {task.original_due_date && <span className="block text-xs text-muted-foreground">Originally {fmtDate(task.original_due_date)}</span>}
                </Detail>
                <Detail label="Completed on">
                  {fmtDateTime(task.completed_at)}
                  {task.status === "completed" && <span className={`block text-xs ${task.completed_on_time ? "text-success" : "text-destructive"}`}>{task.completed_on_time ? "On time" : "Late"}</span>}
                </Detail>
                <Detail label="Category">{task.category_name ? `${task.category_group} · ${task.category_name}` : "—"}</Detail>
                <Detail label="Department">{task.department_name ?? "—"}</Detail>
                <Detail label="Project">{task.project_id ? <Link href={`/projects/${task.project_id}`} className="text-info hover:underline">{task.project_name}</Link> : "—"}</Detail>
                <Detail label="Estimated / actual">{fmtHours(task.estimated_hours)} / {fmtHours(task.actual_hours)}</Detail>
                <Detail label="Complexity">{COMPLEXITY_LABELS[task.complexity]}</Detail>
                <Detail label="Delay cause">{DELAY_CAUSE_LABELS[task.delay_cause]}</Detail>
                {task.quality_rating !== null && <Detail label="Quality rating">{task.quality_rating} / {settings.evaluation_scale.max}</Detail>}
              </dl>
              {(task.supervisor_feedback || task.evidence_notes || task.cancelled_reason) && (
                <div className="grid gap-3 border-t pt-4 md:grid-cols-2">
                  {task.supervisor_feedback && <Detail label="Supervisor feedback"><span className="whitespace-pre-wrap">{task.supervisor_feedback}</span></Detail>}
                  {task.evidence_notes && <Detail label="Supporting evidence"><span className="whitespace-pre-wrap">{task.evidence_notes}</span></Detail>}
                  {task.cancelled_reason && <Detail label="Cancellation reason">{task.cancelled_reason}</Detail>}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Subtasks</CardTitle>
                {canManage && !task.parent_task_id && (
                  <Button size="sm" variant="outline" asChild data-no-print>
                    <Link href={`/tasks/new?parent=${task.id}`}><Plus /> Add</Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {(subtasks.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No subtasks.</p>
                ) : (
                  <ul className="space-y-2">
                    {(subtasks.data ?? []).map((s) => (
                      <li key={s.id} className="flex items-center gap-2 text-sm">
                        <StatusBadge status={s.effective_status} />
                        <Link href={`/tasks/${s.id}`} className="min-w-0 flex-1 truncate hover:underline">{s.task_code} · {s.title}</Link>
                        <span className="text-xs tabular-nums text-muted-foreground">{s.completion_percentage}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Dependencies</CardTitle></CardHeader>
              <CardContent>
                <DependencyPanel taskId={task.id} dependencies={(depTasks ?? []) as never} options={depOptions} canManage={canManage && task.status !== "completed"} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Attachments & evidence</CardTitle></CardHeader>
            <CardContent>
              <AttachmentPanel taskId={task.id} attachments={(attachments.data ?? []) as TaskAttachment[]} currentUserId={me.id} canManage={canManage} canUpload={isAssignee || canManage} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Comments & updates</CardTitle></CardHeader>
            <CardContent>
              <CommentThread taskId={task.id} comments={(comments.data ?? []) as TaskComment[]} />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Activity history</CardTitle>
            <p className="text-xs text-muted-foreground">Append-only – entries cannot be edited or deleted.</p>
          </CardHeader>
          <CardContent>
            {task.is_overdue && <p className="mb-3 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3" /> Overdue since {fmtDate(task.due_date)}</p>}
            <TaskActivityTimeline items={(activity.data ?? []) as TaskActivity[]} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
