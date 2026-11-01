import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek } from "@/lib/domain/dates";
import { STATUS_COLORS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { withParams, type SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import type { TaskOverview } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Month calendar of due dates (server-rendered, no calendar dependency). */
export function TaskCalendar({ tasks, month, today, basePath, params }: { tasks: TaskOverview[]; month: string; today: string; basePath: string; params: SearchParams }) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const gridStart = startOfWeek(first);
  const days: string[] = [];
  for (let d = gridStart; d <= last || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, TaskOverview[]>();
  for (const t of tasks) {
    const list = byDay.get(t.due_date) ?? [];
    list.push(t);
    byDay.set(t.due_date, list);
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="font-semibold">{fmtDate(first, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" asChild aria-label="Previous month">
            <Link href={withParams(basePath, params, { month: addMonths(first, -1).slice(0, 7) })}><ChevronLeft /></Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={withParams(basePath, params, { month: null })}>Today</Link>
          </Button>
          <Button variant="outline" size="icon-sm" asChild aria-label="Next month">
            <Link href={withParams(basePath, params, { month: addMonths(first, 1).slice(0, 7) })}><ChevronRight /></Link>
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const items = byDay.get(d) ?? [];
          const inMonth = d >= first && d <= last;
          return (
            <div key={d} className={cn("min-h-24 border-b border-r p-1.5 text-xs md:min-h-28", !inMonth && "bg-muted/30 text-muted-foreground")}>
              <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full", d === today && "bg-primary font-semibold text-white")}>
                {Number(d.slice(8))}
              </div>
              <div className="space-y-1">
                {items.slice(0, 3).map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    title={`${t.task_code} · ${t.title} (${t.assignee_names.join(", ")})`}
                    className="block truncate rounded px-1.5 py-0.5 text-white hover:opacity-90"
                    style={{ background: STATUS_COLORS[t.effective_status] }}
                  >
                    {t.title}
                  </Link>
                ))}
                {items.length > 3 && (
                  <Link href={withParams(basePath, params, { view: null, due_from: d, due_to: d, month: null })} className="block px-1 text-info hover:underline">
                    +{items.length - 3} more
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
