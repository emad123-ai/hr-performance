import { Progress } from "@/components/ui/progress";
import type { ScoreComponents } from "@/lib/domain/scoring";
import type { KpiWeights } from "@/lib/types";

const ROWS: { key: keyof KpiWeights; label: string; source: "Automatic" | "Manager" | "Task ratings / manager" }[] = [
  { key: "completion", label: "Task completion rate", source: "Automatic" },
  { key: "on_time", label: "On-time delivery", source: "Automatic" },
  { key: "quality", label: "Quality & accuracy", source: "Task ratings / manager" },
  { key: "ownership", label: "Ownership & initiative", source: "Manager" },
  { key: "communication", label: "Communication & coordination", source: "Manager" },
];

/** Per-KPI score, weight and weighted contribution – automatic vs. subjective inputs kept visibly separate. */
export function KpiBreakdown({ components, weights, eligible }: { components: ScoreComponents; weights: KpiWeights; eligible?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-2">KPI</th>
            <th className="py-2 pr-2">Source</th>
            <th className="py-2 pr-2 text-right">Weight</th>
            <th className="w-48 py-2 pr-2">Score</th>
            <th className="py-2 text-right">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const v = components[r.key];
            return (
              <tr key={r.key} className="border-b last:border-0">
                <td className="py-2.5 pr-2 font-medium">{r.label}</td>
                <td className="py-2.5 pr-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${r.source === "Automatic" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>{r.source}</span>
                </td>
                <td className="py-2.5 pr-2 text-right tabular-nums">{weights[r.key]}%</td>
                <td className="py-2.5 pr-2">
                  {v === null ? <span className="text-xs text-muted-foreground">No data – excluded</span> : (
                    <div className="flex items-center gap-2"><Progress value={v} className="h-1.5" /><span className="w-12 text-right tabular-nums">{v.toFixed(1)}</span></div>
                  )}
                </td>
                <td className="py-2.5 text-right tabular-nums">{v === null ? "—" : ((v * weights[r.key]) / 100).toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {eligible !== undefined && <p className="mt-2 text-xs text-muted-foreground">Based on {eligible} task(s) with a final outcome in the period (cancelled tasks, approved extensions and external/management delays are not penalised).</p>}
    </div>
  );
}
