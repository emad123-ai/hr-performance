import {
  addDays, addMonths, endOfMonth, isISODate, startOfMonth, startOfQuarter, startOfWeek, startOfYear, type ISODate,
} from "./dates";

export const PERIOD_PRESETS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "last_7", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30", label: "Last 30 days" },
  { value: "this_quarter", label: "This quarter" },
  { value: "last_90", label: "Last 90 days" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["value"];

export interface ResolvedPeriod {
  preset: PeriodPreset;
  from: ISODate;
  to: ISODate;
  label: string;
  granularity: "day" | "week" | "month";
}

export function resolvePeriod(preset: string | undefined, today: ISODate, from?: string, to?: string): ResolvedPeriod {
  const p = (PERIOD_PRESETS.find((x) => x.value === preset)?.value ?? "this_month") as PeriodPreset;
  let f: ISODate;
  let t: ISODate = today;
  switch (p) {
    case "today": f = today; break;
    case "this_week": f = startOfWeek(today); t = addDays(f, 6); break;
    case "last_7": f = addDays(today, -6); break;
    case "last_month": f = addMonths(startOfMonth(today), -1); t = endOfMonth(f); break;
    case "last_30": f = addDays(today, -29); break;
    case "this_quarter": f = startOfQuarter(today); t = addDays(addMonths(f, 3), -1); break;
    case "last_90": f = addDays(today, -89); break;
    case "this_year": f = startOfYear(today); t = f.slice(0, 4) + "-12-31"; break;
    case "custom":
      if (isISODate(from) && isISODate(to) && from <= to) { f = from; t = to; }
      else { f = startOfMonth(today); t = endOfMonth(today); }
      break;
    case "this_month":
    default:
      f = startOfMonth(today); t = endOfMonth(today);
  }
  const days = Math.round((Date.parse(t) - Date.parse(f)) / 86_400_000) + 1;
  const granularity = days <= 31 ? "day" : days <= 120 ? "week" : "month";
  const label = p === "custom" ? `${f} → ${t}` : PERIOD_PRESETS.find((x) => x.value === p)!.label;
  return { preset: p, from: f, to: t, label, granularity };
}

/** Review periods: monthly / quarterly / annual windows containing the anchor date. */
export function reviewPeriod(type: "monthly" | "quarterly" | "annual", anchor: ISODate, fiscalStartMonth = 1) {
  if (type === "monthly") {
    const from = startOfMonth(anchor);
    return { from, to: endOfMonth(anchor) };
  }
  if (type === "quarterly") {
    const from = startOfQuarter(anchor);
    return { from, to: addDays(addMonths(from, 3), -1) };
  }
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  const startYear = month >= fiscalStartMonth ? year : year - 1;
  const from = `${startYear}-${String(fiscalStartMonth).padStart(2, "0")}-01`;
  return { from, to: addDays(addMonths(from, 12), -1) };
}
