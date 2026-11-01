import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_BANDS, DEFAULT_WEIGHTS, type Band } from "@/lib/domain/scoring";
import { todayInZone } from "@/lib/domain/dates";
import type { KpiWeights } from "@/lib/types";

export interface AppSettings {
  company: { name: string; timezone: string; fiscal_year_start_month: number; logo_url: string | null };
  kpi_weights: KpiWeights;
  evaluation_scale: { max: number; labels: Record<string, string> };
  performance_bands: Band[];
  performance_rules: { min_tasks_for_evaluation: number; default_estimated_hours: number; complexity_multipliers: Record<string, number> };
  working_time: { working_days: number[]; hours_per_day: number };
  workload: { horizon_days: number; underutilized_below: number; balanced_up_to: number; high_up_to: number };
  reminders: { days_before_due: number[]; notify_overdue: boolean; notify_milestones: boolean };
  priorities: Record<string, { label: string; description: string; target_days: number }>;
  statuses: Record<string, { label: string; color: string }>;
  designations: string[];
}

const DEFAULTS: AppSettings = {
  company: { name: "Your Company", timezone: "Asia/Karachi", fiscal_year_start_month: 1, logo_url: null },
  kpi_weights: DEFAULT_WEIGHTS,
  evaluation_scale: { max: 5, labels: {} },
  performance_bands: DEFAULT_BANDS,
  performance_rules: { min_tasks_for_evaluation: 3, default_estimated_hours: 4, complexity_multipliers: { "1": 1, "2": 1.5, "3": 2 } },
  working_time: { working_days: [1, 2, 3, 4, 5], hours_per_day: 8 },
  workload: { horizon_days: 10, underutilized_below: 60, balanced_up_to: 90, high_up_to: 110 },
  reminders: { days_before_due: [1, 3], notify_overdue: true, notify_milestones: true },
  priorities: {},
  statuses: {},
  designations: [],
};

/** All settings rows merged over safe defaults (cached per request). */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("system_settings").select("key, value");
  const merged = structuredClone(DEFAULTS) as unknown as Record<string, unknown>;
  for (const row of data ?? []) {
    const def = merged[row.key];
    merged[row.key] =
      def && typeof def === "object" && !Array.isArray(def) && row.value && typeof row.value === "object" && !Array.isArray(row.value)
        ? { ...(def as object), ...(row.value as object) }
        : row.value;
  }
  return merged as unknown as AppSettings;
});

/** "Today" in the company's time zone. */
export async function getToday(): Promise<string> {
  const s = await getSettings();
  return todayInZone(s.company.timezone);
}
