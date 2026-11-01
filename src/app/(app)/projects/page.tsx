import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireUser, isManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFormOptions } from "@/lib/queries/options";
import { ilikeTerm, isUuid, sp, type SearchParams } from "@/lib/search-params";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoBadge, PriorityBadge, ProjectStatusBadge } from "@/components/shared/badges";
import { ProjectFormDialog } from "@/components/projects/project-form";
import { PRIORITY_LABELS, PROJECT_STATUS_LABELS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import type { ProjectOverview } from "@/lib/types";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireUser();
  const params = await searchParams;
  const supabase = await createClient();
  const options = await getFormOptions(me);
  let q = supabase.from("project_overview").select("*");
  const search = sp(params, "q");
  if (search) q = q.or(`name.ilike.${ilikeTerm(search)},project_code.ilike.${ilikeTerm(search)}`);
  const status = sp(params, "status");
  if (status && status in PROJECT_STATUS_LABELS) q = q.eq("status", status);
  else if (!status) q = q.in("status", ["planning", "active", "on_hold"]);
  const priority = sp(params, "priority");
  if (priority && priority in PRIORITY_LABELS) q = q.eq("priority", priority);
  const dept = sp(params, "department");
  if (isUuid(dept)) q = q.eq("department_id", dept);
  const { data, error } = await q.order("target_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ProjectOverview[];

  return (
    <>
      <PageHeader
        title="Projects & initiatives"
        description="Track departmental projects, milestones and the tasks that deliver them."
        actions={isManager(me) ? <ProjectFormDialog people={options.allPeople} departments={options.departments} /> : undefined}
      />
      <FilterBar
        searchPlaceholder="Search projects…"
        filters={[
          { key: "status", label: "Status", options: Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label })) },
          { key: "priority", label: "Priority", options: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })) },
          { key: "department", label: "Department", options: options.departments.map((d) => ({ value: d.id, label: d.label })) },
        ]}
      />
      {rows.length === 0 ? <EmptyState title="No projects found" description="Open projects appear here by default; use the Status filter to see completed ones." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block">
              <Card className="h-full transition-colors hover:border-info/50">
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">{p.project_code}</p>
                      <h2 className="truncate font-semibold">{p.name}</h2>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <ProjectStatusBadge status={p.status} />
                      {p.is_demo && <DemoBadge />}
                    </div>
                  </div>
                  <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{p.description ?? "No description"}</p>
                  <div>
                    <div className="mb-1 flex justify-between text-xs"><span>Progress</span><span className="font-medium tabular-nums">{Number(p.progress).toFixed(0)}%</span></div>
                    <Progress value={p.progress} indicatorClassName={p.is_delayed ? "bg-destructive" : undefined} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <PriorityBadge priority={p.priority} />
                    <span>{p.completed_tasks}/{p.total_tasks} tasks</span>
                    <span>{p.milestones_completed}/{p.milestone_count} milestones</span>
                    <span>Owner: {p.owner_name ?? "—"}</span>
                    <span>Target {fmtDate(p.target_date)}</span>
                  </div>
                  {(p.is_delayed || p.milestones_delayed > 0 || p.overdue_tasks > 0) && (
                    <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                      <AlertTriangle className="size-3" />
                      {[p.is_delayed && "Past target date", p.milestones_delayed > 0 && `${p.milestones_delayed} delayed milestone(s)`, p.overdue_tasks > 0 && `${p.overdue_tasks} overdue task(s)`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
