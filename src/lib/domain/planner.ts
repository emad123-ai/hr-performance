import type { DailyPlanItem } from "../types";

export interface PlanSummary {
  planned: number;
  completed: number;
  pending: number;
  blocked: number;
  estimatedHours: number;
  actualHours: number;
  completionPct: number | null;
}

/** Daily summary: completion % = completed / all planned activities. */
export function summarizePlan(items: Pick<DailyPlanItem, "status" | "estimated_hours" | "actual_hours">[]): PlanSummary {
  const s = { planned: items.length, completed: 0, pending: 0, blocked: 0, estimatedHours: 0, actualHours: 0 };
  for (const i of items) {
    if (i.status === "completed") s.completed++;
    else if (i.status === "blocked") s.blocked++;
    else s.pending++;
    s.estimatedHours += Number(i.estimated_hours ?? 0);
    s.actualHours += Number(i.actual_hours ?? 0);
  }
  return { ...s, completionPct: items.length ? Math.round((s.completed / items.length) * 100) : null };
}
