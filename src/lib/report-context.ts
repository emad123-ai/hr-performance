import "server-only";
import { resolvePeriod } from "@/lib/domain/periods";
import { getPeriod } from "@/lib/period";
import { getToday } from "@/lib/settings";
import { isUuid, sp, type SearchParams } from "@/lib/search-params";
import type { ReportContext, ReportDef } from "@/lib/reports";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { ColumnFormat } from "@/lib/reports";

export async function buildReportContext(def: ReportDef, params: SearchParams): Promise<ReportContext & { label: string; preset: string }> {
  const today = await getToday();
  const p = !sp(params, "period") && def.defaultPreset ? resolvePeriod(def.defaultPreset, today) : await getPeriod(params);
  const dept = sp(params, "department");
  const emp = sp(params, "employee");
  return {
    from: p.from, to: p.to, label: p.label, preset: p.preset, today,
    department: isUuid(dept) ? dept : null,
    employee: isUuid(emp) ? emp : null,
  };
}

export function formatCell(value: unknown, format: ColumnFormat = "text"): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (format) {
    case "date": return fmtDate(String(value));
    case "datetime": return fmtDateTime(String(value));
    case "pct": return `${Number(value).toFixed(1)}%`;
    case "hours": return `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 })} h`;
    case "number": return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
    default: return Array.isArray(value) ? value.join(", ") : String(value);
  }
}
