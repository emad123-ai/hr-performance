import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFormOptions } from "@/lib/queries/options";
import { getToday } from "@/lib/settings";
import { isUuid, type SearchParams } from "@/lib/search-params";
import { addDays } from "@/lib/domain/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/shared/kpi-card";
import { DemoBadge, PriorityBadge, ProjectStatusBadge, StatusBadge } from "@/components/shared/badges";
import { Callout, PrintButton } from "@/components/shared/misc";
import { MilestoneList, ProjectFormDialog } from "@/components/projects/project-form";
import { ProjectTimeline } from "@/components/projects/project-timeline";
import { fmtDate } from "@/lib/format";
import type { Milestone, ProjectOverview, TaskOverview } from "@/lib/types";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const me = await requireUser();
  const supabase = await createClient();
  const { data: project } = await supabase.from("project_overview").select("*").eq("id", id).maybeSingle<ProjectOverview>();
  if (!project) notFound();
  const [tasks, milestones, members, today] = await Promise.all([
    supabase.from("task_overview").select("*").eq("project_id", id).order("due_date"),
    supabase.from("project_milestones").select("*").eq("project_id", id).order("due_date"),
    supabase.from("project_members").select("user_id, member_role, profile:profiles(full_name, designation)").eq("project_id", id),
    getToday(),
  ]);
  const canManage = me.role === "admin" || (me.role === "team_lead" && (project.owner_id === me.id || project.created_by === me.id));
  const options = me.role !== "employee" ? await getFormOptions(me) : null;
  const taskRows = (tasks.data ?? []) as TaskOverview[];
  const ms = (milestones.data ?? []) as Milestone[];
  const memberRows = (members.data ?? []) as unknown as { user_id: string; member_role: string; profile: { full_name: string; designation: string | null } | null }[];

  const allDates = [project.start_date, project.target_date, ...taskRows.flatMap((t) => [t.start_date, t.due_date]), ...ms.map((m) => m.due_date)].filter(Boolean) as string[];
  const start = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : today;
  const end = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : addDays(today, 30);
  const byPerson = new Map<string, { open: number; done: number }>();
  taskRows.filter((t) => t.status !== "cancelled").forEach((t) => t.assignee_names.forEach((n) => {
    const v = byPerson.get(n) ?? { open: 0, done: 0 };
    if (t.status === "completed") v.done++; else v.open++;
    byPerson.set(n, v);
  }));

  return (
    <div className="space-y-5">
      <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-no-print><ArrowLeft className="size-4" /> Projects</Link>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{project.project_code}</span>
            <ProjectStatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            {project.is_demo && <DemoBadge />}
          </div>
          <h1 className="text-xl font-semibold md:text-2xl">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            Owner {project.owner_name ?? "—"} · {project.department_name ?? "No department"} · {fmtDate(project.start_date)} → {fmtDate(project.target_date)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" data-no-print>
          <PrintButton label="Print report" />
          {options && <Button size="sm" asChild><Link href={`/tasks/new?project=${id}`}><Plus /> Add task</Link></Button>}
          {canManage && options && <ProjectFormDialog project={project} memberIds={memberRows.map((m) => m.user_id)} people={options.allPeople} departments={options.departments} />}
        </div>
      </div>

      {project.is_delayed && <Callout tone="danger">The target completion date ({fmtDate(project.target_date)}) has passed.</Callout>}
      {project.milestones_delayed > 0 && <Callout tone="warning">{project.milestones_delayed} milestone(s) are past their due date.</Callout>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Progress" value={`${Number(project.progress).toFixed(0)}%`} />
        <KpiCard label="Tasks" value={`${project.completed_tasks}/${project.total_tasks}`} hint="Completed / total" />
        <KpiCard label="Overdue tasks" value={project.overdue_tasks} tone={project.overdue_tasks ? "danger" : "default"} />
        <KpiCard label="Milestones" value={`${project.milestones_completed}/${project.milestone_count}`} />
        <KpiCard label="Team" value={project.member_count} hint="Members" />
      </section>
      <Progress value={project.progress} className="h-3" />

      <Tabs defaultValue="overview">
        <TabsList data-no-print>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({taskRows.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Description & remarks</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{project.description ?? "No description."}</p>
                {project.remarks && <p className="rounded bg-muted p-3 text-muted-foreground">{project.remarks}</p>}
                <h3 className="pt-2 font-semibold">Task allocation</h3>
                {byPerson.size === 0 ? <p className="text-muted-foreground">No tasks yet.</p> : (
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {[...byPerson.entries()].map(([n, v]) => <li key={n} className="flex justify-between rounded border px-3 py-1.5"><span>{n}</span><span className="text-muted-foreground">{v.open} open · {v.done} done</span></li>)}
                  </ul>
                )}
              </CardContent>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader><CardTitle>Milestones</CardTitle></CardHeader>
                <CardContent><MilestoneList projectId={id} milestones={ms} today={today} canManage={canManage} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Team members</CardTitle></CardHeader>
                <CardContent>
                  {memberRows.length === 0 ? <p className="text-sm text-muted-foreground">No members assigned.</p> : (
                    <ul className="space-y-1 text-sm">
                      {memberRows.map((m) => <li key={m.user_id} className="flex justify-between"><span>{m.profile?.full_name}</span><span className="text-muted-foreground">{m.member_role}</span></li>)}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="timeline">
          <Card><CardContent className="pt-5"><ProjectTimeline tasks={taskRows.filter((t) => t.status !== "cancelled")} milestones={ms} start={start} end={end} today={today} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="tasks">
          <Card>
            <CardContent className="pt-5">
              {taskRows.length === 0 ? <p className="text-sm text-muted-foreground">No tasks linked to this project.</p> : (
                <ul className="divide-y">
                  {taskRows.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <StatusBadge status={t.effective_status} />
                      <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{t.task_code} · {t.title}</Link>
                      <span className="text-xs text-muted-foreground">{t.assignee_names.join(", ")}</span>
                      <span className="w-24 text-right text-xs">{fmtDate(t.due_date)}</span>
                      <span className="w-10 text-right text-xs tabular-nums">{t.completion_percentage}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
