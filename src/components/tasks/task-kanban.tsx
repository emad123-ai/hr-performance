"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { PriorityBadge } from "@/components/shared/badges";
import { Progress } from "@/components/ui/progress";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/constants";
import { canMoveOnBoard } from "@/lib/domain/permissions";
import { moveTask } from "@/lib/actions/tasks";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskOverview, TaskStatus } from "@/lib/types";
import { ProgressDialog, ReviewDialog } from "./task-dialogs";

export interface BoardTask extends Pick<TaskOverview,
  "id" | "task_code" | "title" | "status" | "priority" | "due_date" | "is_overdue" | "completion_percentage" | "assignee_names"> {
  isAssignee: boolean;
  canManage: boolean;
}

const COLUMNS: TaskStatus[] = ["not_started", "in_progress", "blocked", "under_review", "completed"];

/** Kanban board with native HTML5 drag & drop. Transitions needing input open the matching dialog. */
export function TaskKanban({ tasks, scale }: { tasks: BoardTask[]; scale: number }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [dialog, setDialog] = useState<{ kind: "approve" | "changes" | "blocked"; task: BoardTask } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function drop(to: TaskStatus) {
    const task = tasks.find((t) => t.id === dragId);
    setDragId(null);
    setOver(null);
    if (!task) return;
    if (!canMoveOnBoard(task.status, to, task)) {
      if (task.status !== to) toast.error("You can't move this task there. Open the task for more options.");
      return;
    }
    if (to === "completed") return setDialog({ kind: "approve", task });
    if (task.status === "under_review" && to === "in_progress") return setDialog({ kind: "changes", task });
    if (to === "blocked") return setDialog({ kind: "blocked", task });
    start(async () => {
      const res = await moveTask(task.id, to, task.completion_percentage);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Updated");
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className={cn("grid gap-3 overflow-x-auto pb-2 md:grid-cols-5", pending && "opacity-70")}>
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col);
          return (
            <section
              key={col}
              aria-label={STATUS_LABELS[col]}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(col);
              }}
              className={cn("flex min-h-64 min-w-60 flex-col rounded-lg border bg-muted/40 p-2", over === col && "border-info bg-accent")}
            >
              <header className="mb-2 flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="size-2.5 rounded-full" style={{ background: STATUS_COLORS[col] }} />
                  {STATUS_LABELS[col]}
                </span>
                <span className="rounded bg-white px-1.5 text-xs text-muted-foreground">{items.length}</span>
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {items.map((t) => (
                  <article
                    key={t.id}
                    draggable={t.isAssignee || t.canManage}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      "cursor-grab rounded-md border bg-card p-3 text-sm shadow-xs active:cursor-grabbing",
                      t.is_overdue && "border-l-4 border-l-destructive",
                      dragId === t.id && "opacity-50",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{t.task_code}</span>
                      <PriorityBadge priority={t.priority} className="text-[10px]" />
                    </div>
                    <Link href={`/tasks/${t.id}`} className="line-clamp-2 font-medium hover:text-info hover:underline">{t.title}</Link>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{t.assignee_names.join(", ")}</p>
                    <Progress value={t.completion_percentage} className="mt-2 h-1" />
                    <p className={cn("mt-2 flex items-center gap-1 text-xs", t.is_overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {t.is_overdue ? <AlertTriangle className="size-3" /> : <CalendarClock className="size-3" />} {fmtDate(t.due_date)}
                    </p>
                  </article>
                ))}
                {items.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted-foreground">Drop tasks here</p>}
              </div>
            </section>
          );
        })}
      </div>
      {dialog?.kind === "approve" && (
        <ReviewDialog taskId={dialog.task.id} mode="approve" scale={scale} open onOpenChange={(o) => !o && setDialog(null)} />
      )}
      {dialog?.kind === "changes" && (
        <ReviewDialog taskId={dialog.task.id} mode="request_changes" scale={scale} open onOpenChange={(o) => !o && setDialog(null)} />
      )}
      {dialog?.kind === "blocked" && (
        <ProgressDialog taskId={dialog.task.id} current={dialog.task.completion_percentage} initialStatus="blocked" open onOpenChange={(o) => !o && setDialog(null)} />
      )}
    </>
  );
}
