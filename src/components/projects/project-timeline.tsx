import Link from "next/link";
import { diffDays, addDays } from "@/lib/domain/dates";
import { STATUS_COLORS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import type { Milestone, TaskOverview } from "@/lib/types";

/** Gantt-style timeline built with CSS (no paid or heavy dependency). */
export function ProjectTimeline({ tasks, milestones, start, end, today }: {
  tasks: TaskOverview[]; milestones: Milestone[]; start: string; end: string; today: string;
}) {
  const span = Math.max(diffDays(end, start) + 1, 7);
  const pos = (d: string) => Math.min(100, Math.max(0, (diffDays(d, start) / span) * 100));
  const ticks: string[] = [];
  const step = Math.max(1, Math.ceil(span / 8));
  for (let d = start; d <= end; d = addDays(d, step)) ticks.push(d);
  const rows = [...tasks].sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="relative ml-56 h-6 border-b text-[10px] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pos(t)}%` }}>{fmtDate(t, "dd MMM")}</span>
          ))}
        </div>
        <div className="relative">
          {today >= start && today <= end && (
            <div className="pointer-events-none absolute bottom-0 top-0 z-10 ml-56 w-[calc(100%-14rem)]">
              <div className="absolute bottom-0 top-0 w-px bg-destructive/60" style={{ left: `${pos(today)}%` }} title="Today" />
            </div>
          )}
          {milestones.map((m) => (
            <div key={m.id} className="flex h-7 items-center border-b border-dashed text-xs">
              <span className="w-56 shrink-0 truncate pr-2 font-medium">◆ {m.title}</span>
              <div className="relative h-full flex-1">
                <span
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-white"
                  style={{ left: `${pos(m.due_date)}%`, background: m.status === "completed" ? "#16a34a" : m.due_date < today ? "#dc2626" : "#1f3952" }}
                  title={`${m.title} – ${fmtDate(m.due_date)}`}
                />
              </div>
            </div>
          ))}
          {rows.map((t) => {
            const left = pos(t.start_date);
            const width = Math.max(1.5, pos(t.due_date) - left + 100 / span);
            return (
              <div key={t.id} className="flex h-8 items-center border-b text-xs">
                <Link href={`/tasks/${t.id}`} className="w-56 shrink-0 truncate pr-2 hover:underline" title={t.title}>{t.task_code} · {t.title}</Link>
                <div className="relative h-full flex-1">
                  <div
                    className="absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded"
                    style={{ left: `${left}%`, width: `${width}%`, background: `${STATUS_COLORS[t.effective_status]}33`, border: `1px solid ${STATUS_COLORS[t.effective_status]}` }}
                    title={`${fmtDate(t.start_date)} → ${fmtDate(t.due_date)} · ${t.completion_percentage}% · ${t.assignee_names.join(", ")}`}
                  >
                    <div className="h-full" style={{ width: `${t.completion_percentage}%`, background: STATUS_COLORS[t.effective_status] }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Bars run from start to due date; the filled part shows progress. ◆ = milestone. Red line = today.</p>
      </div>
    </div>
  );
}
