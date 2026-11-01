"use client";
import { useState } from "react";
import {
  CalendarClock, CheckCircle2, MoreHorizontal, Pencil, RotateCcw, Send, ShieldAlert, SlidersHorizontal, Undo2, UserRoundCog, XCircle, Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { allowedTaskActions } from "@/lib/domain/permissions";
import type { MultiOption } from "@/components/shared/multi-select";
import type { Role, TaskStatus } from "@/lib/types";
import {
  DeadlineDialog, DelayCauseDialog, ProgressDialog, ReassignDialog, ReasonDialog, ReviewDialog, SubmitDialog,
} from "./task-dialogs";
import { TaskEditDialog, type EditableTask } from "./task-edit-dialog";

type DialogKind = "progress" | "submit" | "approve" | "changes" | "reopen" | "cancel" | "escalate" | "deadline" | "delay" | "reassign" | "edit";

export function TaskActionBar({
  task, role, isAssignee, canManage, scale, people, editOptions,
}: {
  task: EditableTask & { status: TaskStatus; completion_percentage: number; due_date: string; delay_cause: string; assignee_ids: string[] };
  role: Role;
  isAssignee: boolean;
  canManage: boolean;
  scale: number;
  people: MultiOption[];
  editOptions: React.ComponentProps<typeof TaskEditDialog>["options"];
}) {
  const [open, setOpen] = useState<DialogKind | null>(null);
  const actions = allowedTaskActions({ role, status: task.status, isAssignee, canManage });
  const close = (o: boolean) => !o && setOpen(null);
  const has = (a: Parameters<typeof actions.includes>[0]) => actions.includes(a);

  return (
    <div className="flex flex-wrap items-center gap-2" data-no-print>
      {has("update_progress") && (
        <Button variant="outline" size="sm" onClick={() => setOpen("progress")}><SlidersHorizontal /> Update progress</Button>
      )}
      {has("submit") && <Button size="sm" onClick={() => setOpen("submit")}><Send /> Submit for review</Button>}
      {has("approve") && (
        <Button size="sm" variant="success" onClick={() => setOpen("approve")}><CheckCircle2 /> {task.status === "under_review" ? "Approve" : "Mark complete"}</Button>
      )}
      {has("request_changes") && <Button size="sm" variant="outline" onClick={() => setOpen("changes")}><Undo2 /> Request changes</Button>}
      {has("reopen") && <Button size="sm" variant="outline" onClick={() => setOpen("reopen")}><RotateCcw /> Reopen</Button>}
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="outline" aria-label="More actions"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {has("edit") && <DropdownMenuItem onSelect={() => setOpen("edit")}><Pencil /> Edit details</DropdownMenuItem>}
            {has("change_deadline") && <DropdownMenuItem onSelect={() => setOpen("deadline")}><CalendarClock /> Change deadline</DropdownMenuItem>}
            {has("reassign") && <DropdownMenuItem onSelect={() => setOpen("reassign")}><UserRoundCog /> Reassign</DropdownMenuItem>}
            {has("classify_delay") && <DropdownMenuItem onSelect={() => setOpen("delay")}><Scale /> Classify delay</DropdownMenuItem>}
            {has("escalate") && <DropdownMenuItem onSelect={() => setOpen("escalate")}><ShieldAlert /> Escalate</DropdownMenuItem>}
            {has("cancel") && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setOpen("cancel")}><XCircle /> Cancel task</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {open === "progress" && <ProgressDialog taskId={task.id} current={task.completion_percentage} initialStatus={task.status} open onOpenChange={close} />}
      {open === "submit" && <SubmitDialog taskId={task.id} open onOpenChange={close} />}
      {open === "approve" && <ReviewDialog taskId={task.id} mode="approve" scale={scale} open onOpenChange={close} />}
      {open === "changes" && <ReviewDialog taskId={task.id} mode="request_changes" scale={scale} open onOpenChange={close} />}
      {open === "reopen" && <ReasonDialog taskId={task.id} kind="reopen" open onOpenChange={close} />}
      {open === "cancel" && <ReasonDialog taskId={task.id} kind="cancel" open onOpenChange={close} />}
      {open === "escalate" && <ReasonDialog taskId={task.id} kind="escalate" open onOpenChange={close} />}
      {open === "deadline" && <DeadlineDialog taskId={task.id} currentDue={task.due_date} open onOpenChange={close} />}
      {open === "delay" && <DelayCauseDialog taskId={task.id} current={task.delay_cause} open onOpenChange={close} />}
      {open === "reassign" && <ReassignDialog taskId={task.id} people={people} current={task.assignee_ids} open onOpenChange={close} />}
      {open === "edit" && <TaskEditDialog task={task} options={editOptions} open onOpenChange={close} />}
    </div>
  );
}
