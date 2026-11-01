import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterBar, type FilterDef } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { listTasks, TASK_SORTS } from "@/lib/queries/tasks";
import { getFormOptions } from "@/lib/queries/options";
import { canManageTask, getManagedUserIds } from "@/lib/queries/people";
import { getSettings, getToday } from "@/lib/settings";
import { endOfMonth, isISODate, startOfMonth } from "@/lib/domain/dates";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/constants";
import { sp, spSort, type SearchParams } from "@/lib/search-params";
import type { CurrentUser } from "@/lib/auth";
import { TaskTable } from "./task-table";
import { TaskKanban } from "./task-kanban";
import { TaskCalendar } from "./task-calendar";
import { ViewSwitcher } from "./view-switcher";

export async function TaskListView({ me, params, scope }: { me: CurrentUser; params: SearchParams; scope: "my" | "team" }) {
  const today = await getToday();
  const view = sp(params, "view") ?? "table";
  const basePath = scope === "my" ? "/tasks/my" : "/tasks";
  const manager = me.role !== "employee";
  const [options, settings, managed] = await Promise.all([getFormOptions(me), getSettings(), getManagedUserIds(me)]);

  let queryParams = params;
  let month = today;
  if (view === "calendar") {
    const m = sp(params, "month");
    month = m && isISODate(`${m}-01`) ? `${m}-01` : today;
    queryParams = { ...params, due_from: startOfMonth(month), due_to: endOfMonth(month) };
  }
  const { rows, total, page, pageSize } = await listTasks({ scope, userId: me.id, today, params: queryParams, paginate: view === "table" });
  const { sort, dir } = spSort(params, TASK_SORTS, "due_date", "asc");

  const filters: FilterDef[] = [
    { key: "status", label: "Status", options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })) },
    { key: "priority", label: "Priority", options: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })) },
    { key: "due", label: "Due", options: [{ value: "today", label: "Due today" }, { value: "week", label: "Due this week" }, { value: "overdue", label: "Overdue" }, { value: "open", label: "All open" }] },
    ...(scope === "team" ? [{ key: "assignee", label: "Assignee", options: options.allPeople.map((p) => ({ value: p.id, label: p.label })) }] : []),
    { key: "project", label: "Project", options: options.projects.map((p) => ({ value: p.id, label: p.label })) },
    { key: "department", label: "Department", options: options.departments.map((d) => ({ value: d.id, label: d.label })) },
    { key: "category", label: "Category", options: options.categories.map((c) => ({ value: c.id, label: `${c.group} · ${c.label}` })) },
  ];

  return (
    <>
      <PageHeader
        title={scope === "my" ? "My Tasks" : "Team Tasks"}
        description={scope === "my" ? "Everything assigned to you, with deadlines and progress." : "All tasks within your authority, across people, projects and departments."}
        actions={
          <>
            <ViewSwitcher basePath={basePath} params={params} current={view} />
            {manager && (
              <Button asChild>
                <Link href="/tasks/new"><Plus /> New task</Link>
              </Button>
            )}
          </>
        }
      />
      <FilterBar filters={filters} searchPlaceholder="Search title or task ID…" />
      {view === "kanban" ? (
        <TaskKanban
          scale={settings.evaluation_scale.max}
          tasks={rows.filter((t) => t.status !== "cancelled").map((t) => ({
            id: t.id, task_code: t.task_code, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date,
            is_overdue: t.is_overdue, completion_percentage: t.completion_percentage, assignee_names: t.assignee_names,
            isAssignee: t.assignee_ids.includes(me.id), canManage: canManageTask(me, t, managed),
          }))}
        />
      ) : view === "calendar" ? (
        <TaskCalendar tasks={rows} month={month} today={today} basePath={basePath} params={params} />
      ) : (
        <TaskTable rows={rows} total={total} page={page} pageSize={pageSize} basePath={basePath} params={params} sort={sort} dir={dir} showAssignees={scope === "team"} />
      )}
      {view === "kanban" && rows.length >= 500 && <p className="mt-2 text-xs text-muted-foreground">Showing the first 500 tasks – narrow the filters to see more.</p>}
    </>
  );
}
