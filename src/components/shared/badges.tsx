import { AlertTriangle, Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  PERFORMANCE_STYLES, PRIORITY_LABELS, PRIORITY_STYLES, PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLES, STATUS_LABELS, STATUS_STYLES, WORKLOAD_STYLES,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { EffectiveStatus, Priority, ProjectStatus } from "@/lib/types";

export function StatusBadge({ status, className }: { status: EffectiveStatus; className?: string }) {
  return (
    <Badge className={cn(STATUS_STYLES[status], className)}>
      {status === "overdue" && <AlertTriangle />}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Badge className={cn(PRIORITY_STYLES[priority], className)}>
      <Flag /> {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge className={PROJECT_STATUS_STYLES[status]}>{PROJECT_STATUS_LABELS[status]}</Badge>;
}

export function WorkloadBadge({ category }: { category: string }) {
  return <Badge className={WORKLOAD_STYLES[category] ?? ""}>{category}</Badge>;
}

export function PerformanceBadge({ category, provisional }: { category: string | null; provisional?: boolean }) {
  if (!category) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge className={PERFORMANCE_STYLES[category] ?? ""} title={provisional ? "Provisional – data incomplete" : undefined}>
      {category}
      {provisional ? " *" : ""}
    </Badge>
  );
}

export function DemoBadge() {
  return <Badge className="border-amber-300 bg-amber-50 text-[10px] uppercase tracking-wide text-amber-800">Demo</Badge>;
}
