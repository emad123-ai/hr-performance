// Workload rules – mirrors public.workload_overview in the database.
import { addDays, isoWeekday, type ISODate } from "./dates";

export interface WorkloadThresholds {
  underutilized_below: number;
  balanced_up_to: number;
  high_up_to: number;
}

export const DEFAULT_THRESHOLDS: WorkloadThresholds = { underutilized_below: 60, balanced_up_to: 90, high_up_to: 110 };

export function workingDaysInHorizon(from: ISODate, days: number, workingDays: number[] = [1, 2, 3, 4, 5]): number {
  let n = 0;
  for (let i = 0; i < Math.max(days, 1); i++) {
    if (workingDays.includes(isoWeekday(addDays(from, i)))) n++;
  }
  return n;
}

export function capacityHours(opts: {
  workingDaysInHorizon: number;
  hoursPerDay: number;
  weeklyCapacityOverride?: number | null;
  workingDaysPerWeek: number;
}): number {
  const perDay = opts.weeklyCapacityOverride != null ? opts.weeklyCapacityOverride / Math.max(opts.workingDaysPerWeek, 1) : opts.hoursPerDay;
  return opts.workingDaysInHorizon * perDay;
}

/** Remaining effort of one task for one assignee (shared tasks are split equally). */
export function remainingTaskHours(estimated: number | null, completionPct: number, assignees: number, defaultHours = 4): number {
  const est = estimated ?? defaultHours;
  return (est * (100 - completionPct)) / 100 / Math.max(assignees, 1);
}

export function utilization(remaining: number, capacity: number): number | null {
  if (capacity <= 0) return null;
  return Math.round((remaining / capacity) * 1000) / 10;
}

export function workloadCategory(util: number | null, t: WorkloadThresholds = DEFAULT_THRESHOLDS): string {
  if (util === null) return "No capacity";
  if (util < t.underutilized_below) return "Underutilized";
  if (util <= t.balanced_up_to) return "Balanced";
  if (util <= t.high_up_to) return "High Workload";
  return "Overloaded";
}
