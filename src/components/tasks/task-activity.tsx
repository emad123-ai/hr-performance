import { ACTIVITY_LABELS, STATUS_LABELS } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import type { TaskActivity } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = {
  status: "status", completion_percentage: "progress", due_date: "due date", original_due_date: "original due date",
  priority: "priority", title: "title", description: "description", estimated_hours: "estimated hours", actual_hours: "actual hours",
  quality_rating: "quality rating", delay_cause: "delay cause", blocker_reason: "blocker", supervisor_feedback: "feedback",
  evidence_notes: "evidence", category_id: "category", project_id: "project", department_id: "department", complexity: "complexity",
  completed_at: "completion date", start_date: "start date", cancelled_reason: "cancellation reason", assignee: "assignee",
};

function show(field: string | null, v: string | null) {
  if (v === null || v === "") return "—";
  if (field === "status") return STATUS_LABELS[v as keyof typeof STATUS_LABELS] ?? v;
  if (field === "completion_percentage") return `${v}%`;
  if (field?.endsWith("_id")) return "updated";
  if (field === "completed_at") return fmtDateTime(v);
  return v.length > 80 ? v.slice(0, 80) + "…" : v;
}

/** Immutable audit trail of everything that happened to the task. */
export function TaskActivityTimeline({ items }: { items: TaskActivity[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 border-l pl-4">
      {items.map((a) => {
        const label = ACTIVITY_LABELS[a.action] ?? a.action.replace(/_/g, " ");
        const isField = a.action === "field_changed";
        return (
          <li key={a.id} className="relative text-sm">
            <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-white bg-primary" />
            <p>
              <span className="font-medium">{a.actor?.full_name ?? (a.action === "became_overdue" ? "" : "System")}</span>{" "}
              {isField ? (
                <>
                  changed <span className="font-medium">{FIELD_LABELS[a.field ?? ""] ?? a.field}</span>
                  {!a.field?.endsWith("_id") && (
                    <> from <span className="text-muted-foreground line-through">{show(a.field, a.old_value)}</span> to <span className="font-medium">{show(a.field, a.new_value)}</span></>
                  )}
                </>
              ) : (
                <>
                  {label}
                  {a.action.startsWith("assignee") && <> <span className="font-medium">{a.new_value ?? a.old_value}</span></>}
                  {a.action.startsWith("attachment") || a.action.startsWith("dependency") ? <> <span className="font-medium">{a.new_value ?? a.old_value}</span></> : null}
                  {a.action === "deadline_changed" && <> from {a.old_value} to <span className="font-medium">{a.new_value}</span></>}
                  {a.action === "approved" && a.new_value && <> (quality {a.new_value})</>}
                </>
              )}
            </p>
            {a.reason && <p className="mt-0.5 text-xs text-muted-foreground">Reason: {a.reason}</p>}
            {a.action.startsWith("comment_") && a.new_value && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">“{a.new_value}”</p>}
            <p className="text-[11px] text-muted-foreground">{fmtDateTime(a.created_at)}</p>
          </li>
        );
      })}
    </ol>
  );
}
