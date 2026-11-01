import Link from "next/link";
import { Repeat, GitBranch, Link2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { DemoBadge, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { Pagination, SortableHead } from "@/components/shared/table-controls";
import { EmptyState } from "@/components/shared/empty-state";
import { fmtDate } from "@/lib/format";
import type { SearchParams } from "@/lib/search-params";
import type { TaskOverview } from "@/lib/types";

export function TaskTable({
  rows, total, page, pageSize, basePath, params, sort, dir, showAssignees = true, emptyAction,
}: {
  rows: TaskOverview[];
  total: number;
  page: number;
  pageSize: number;
  basePath: string;
  params: SearchParams;
  sort: string;
  dir: "asc" | "desc";
  showAssignees?: boolean;
  emptyAction?: React.ReactNode;
}) {
  if (rows.length === 0) {
    return <EmptyState title="No tasks match these filters" description="Try clearing filters or choosing another period." action={emptyAction} />;
  }
  const head = { basePath, params, current: sort, dir };
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead label="ID" column="task_code" {...head} className="w-24" />
            <SortableHead label="Task" column="title" {...head} />
            {showAssignees && <TableHead>Assigned to</TableHead>}
            <SortableHead label="Priority" column="priority" {...head} />
            <SortableHead label="Status" column="status" {...head} />
            <SortableHead label="Progress" column="completion_percentage" {...head} className="w-32" />
            <SortableHead label="Due" column="due_date" {...head} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-mono text-xs text-muted-foreground">{t.task_code}</TableCell>
              <TableCell className="max-w-[22rem]">
                <Link href={`/tasks/${t.id}`} className="font-medium hover:text-info hover:underline">
                  {t.title}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {t.category_name && (
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full" style={{ background: t.category_color ?? "#64748b" }} />
                      {t.category_name}
                    </span>
                  )}
                  {t.project_name && <span>· {t.project_name}</span>}
                  {t.recurrence !== "none" && <Repeat className="size-3" aria-label="Recurring" />}
                  {t.subtask_count > 0 && <span className="inline-flex items-center gap-0.5"><GitBranch className="size-3" />{t.subtask_count}</span>}
                  {t.open_dependency_count > 0 && <span className="inline-flex items-center gap-0.5 text-amber-700"><Link2 className="size-3" />waiting on {t.open_dependency_count}</span>}
                  {t.is_demo && <DemoBadge />}
                </div>
              </TableCell>
              {showAssignees && <TableCell className="max-w-[12rem] truncate text-sm">{t.assignee_names.join(", ") || "—"}</TableCell>}
              <TableCell><PriorityBadge priority={t.priority} /></TableCell>
              <TableCell><StatusBadge status={t.effective_status} /></TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={t.completion_percentage} className="h-1.5" />
                  <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{t.completion_percentage}%</span>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                <span className={t.is_overdue ? "font-medium text-destructive" : ""}>{fmtDate(t.due_date)}</span>
                {t.is_overdue && <span className="block text-[11px] text-destructive">{t.days_overdue}d overdue</span>}
                {t.original_due_date && <span className="block text-[11px] text-muted-foreground">extended</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination basePath={basePath} params={params} page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
