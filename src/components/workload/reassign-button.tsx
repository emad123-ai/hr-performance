"use client";
import { useState } from "react";
import { UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReassignDialog } from "@/components/tasks/task-dialogs";
import type { MultiOption } from "@/components/shared/multi-select";

export function ReassignButton({ taskId, current, people }: { taskId: string; current: string[]; people: MultiOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><UserRoundCog /> Reassign</Button>
      {open && <ReassignDialog taskId={taskId} current={current} people={people} open onOpenChange={setOpen} />}
    </>
  );
}
