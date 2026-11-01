"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuickAddButton } from "@/components/layout/topbar";
import { TaskForm, type TaskFormProps } from "./task-form";

export function QuickAddTask({ options, today }: Pick<TaskFormProps, "options" | "today">) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <QuickAddButton onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quick add task</DialogTitle>
            <DialogDescription>Assignees are notified immediately. Use “New task” for descriptions, recurrence and dependencies.</DialogDescription>
          </DialogHeader>
          <TaskForm
            compact
            options={options}
            today={today}
            onDone={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
