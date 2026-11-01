import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, isManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ilikeTerm, sp, type SearchParams } from "@/lib/search-params";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ProjectStatusBadge, StatusBadge } from "@/components/shared/badges";
import { fmtDate } from "@/lib/format";
import type { ProjectStatus, EffectiveStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireUser();
  const q = sp(await searchParams, "q")?.trim() ?? "";
  if (q.length < 2) return <><PageHeader title="Search" /><EmptyState title="Type at least 2 characters in the search box" /></>;
  const supabase = await createClient();
  const term = ilikeTerm(q);
  const [tasks, people, projects] = await Promise.all([
    supabase.from("task_overview").select("id, task_code, title, effective_status, due_date, assignee_names")
      .or(`title.ilike.${term},task_code.ilike.${term},description.ilike.${term}`).order("due_date", { ascending: false }).limit(25),
    isManager(me)
      ? supabase.from("profiles").select("id, full_name, designation, email, employee_code").or(`full_name.ilike.${term},email.ilike.${term},employee_code.ilike.${term},designation.ilike.${term}`).limit(15)
      : Promise.resolve({ data: [] as { id: string; full_name: string; designation: string | null; email: string; employee_code: string }[] }),
    supabase.from("projects").select("id, project_code, name, status").or(`name.ilike.${term},project_code.ilike.${term}`).limit(10),
  ]);
  const total = (tasks.data?.length ?? 0) + (people.data?.length ?? 0) + (projects.data?.length ?? 0);

  return (
    <>
      <PageHeader title={`Search results for “${q}”`} description={`${total} result(s) you have access to.`} />
      {total === 0 ? <EmptyState title="No matches" description="Try a task ID (e.g. TSK-00012), a name or part of a title." /> : (
        <div className="grid gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>Tasks ({tasks.data?.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y">
                {(tasks.data ?? []).map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <StatusBadge status={t.effective_status as EffectiveStatus} />
                    <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{t.task_code} · {t.title}</Link>
                    <span className="text-xs text-muted-foreground">{(t.assignee_names as string[]).join(", ")} · {fmtDate(t.due_date)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <div className="space-y-5">
            {isManager(me) && (
              <Card>
                <CardHeader><CardTitle>People ({people.data?.length ?? 0})</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {(people.data ?? []).map((p) => (
                      <li key={p.id}><Link href={`/employees/${p.id}`} className="font-medium hover:underline">{p.full_name}</Link><p className="text-xs text-muted-foreground">{p.designation ?? "—"} · {p.employee_code}</p></li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle>Projects ({projects.data?.length ?? 0})</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {(projects.data ?? []).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2"><Link href={`/projects/${p.id}`} className="hover:underline">{p.project_code} · {p.name}</Link><ProjectStatusBadge status={p.status as ProjectStatus} /></li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
