import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getFormOptions } from "@/lib/queries/options";
import { openTaskOptions } from "@/lib/queries/tasks";
import { getToday } from "@/lib/settings";
import { isUuid, sp, type SearchParams } from "@/lib/search-params";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { TaskForm } from "@/components/tasks/task-form";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireRole(["admin", "team_lead"]);
  const params = await searchParams;
  const [options, deps, today] = await Promise.all([getFormOptions(me), openTaskOptions(), getToday()]);
  const parent = sp(params, "parent");
  const project = sp(params, "project");
  const assignee = sp(params, "assignee");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={parent ? "New subtask" : "New task"} description="Assignees are notified as soon as the task is created." />
      <Card>
        <CardContent className="pt-5">
          <TaskForm
            options={options}
            dependencyOptions={deps}
            today={today}
            defaults={{
              parent_task_id: isUuid(parent) ? parent : "",
              project_id: isUuid(project) ? project : "",
              assignee_ids: isUuid(assignee) ? [assignee] : [],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
