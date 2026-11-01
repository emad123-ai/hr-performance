import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import { sp, type SearchParams } from "@/lib/search-params";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  BandsForm, CompanyForm, DesignationsForm, EvaluationForm, KpiWeightsForm, LabelsForm, MaintenancePanel, ReferenceManager, RemindersForm, WorkingTimeForm,
} from "@/components/settings/settings-forms";

export const metadata: Metadata = { title: "Settings" };

const TABS = [
  { value: "company", label: "Company" },
  { value: "organisation", label: "Departments & teams" },
  { value: "roles", label: "Roles & designations" },
  { value: "categories", label: "Task categories" },
  { value: "workflow", label: "Priorities & statuses" },
  { value: "performance", label: "Performance" },
  { value: "time", label: "Working time & workload" },
  { value: "reminders", label: "Reminders" },
  { value: "data", label: "Data & maintenance" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const tab = TABS.find((t) => t.value === sp(params, "tab"))?.value ?? "company";
  const settings = await getSettings();
  const supabase = await createClient();
  const [depts, teams, cats, people, demo, roleCounts] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("teams").select("*").order("name"),
    supabase.from("categories").select("*").order("group_name").order("sort_order"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_demo", true),
    supabase.from("profiles").select("role").eq("is_active", true),
  ]);
  const peopleOpts = (people.data ?? []).map((p) => ({ id: p.id as string, label: p.full_name as string }));
  const deptOpts = (depts.data ?? []).map((d) => ({ id: d.id as string, label: d.name as string }));
  const counts = (roleCounts.data ?? []).reduce<Record<string, number>>((a, r) => ({ ...a, [r.role as string]: (a[r.role as string] ?? 0) + 1 }), {});

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure the application for your organisation. All changes are recorded in the audit log."
        actions={<Button variant="outline" size="sm" asChild><Link href="/settings/audit"><ScrollText /> Audit log</Link></Button>}
      />
      <div className="grid gap-5 lg:grid-cols-[14rem_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Settings sections">
          {TABS.map((t) => (
            <Link key={t.value} href={`/settings?tab=${t.value}`} className={cn("whitespace-nowrap rounded-md px-3 py-2 text-sm", tab === t.value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {t.label}
            </Link>
          ))}
        </nav>
        <Card>
          <CardHeader>
            <CardTitle>{TABS.find((t) => t.value === tab)?.label}</CardTitle>
            {tab === "performance" && <CardDescription>Weights, rating scale and categories used by the performance evaluation engine.</CardDescription>}
          </CardHeader>
          <CardContent>
            {tab === "company" && <CompanyForm value={settings.company} />}
            {tab === "organisation" && (
              <div className="grid gap-8 xl:grid-cols-2">
                <ReferenceManager table="departments" title="Departments" canToggle rows={(depts.data ?? []) as never}
                  fields={[{ key: "name", label: "Name" }, { key: "code", label: "Code" }, { key: "description", label: "Description", type: "textarea" }, { key: "head_id", label: "Head of department", type: "select", options: peopleOpts }]} />
                <ReferenceManager table="teams" title="Teams" rows={(teams.data ?? []) as never}
                  fields={[{ key: "name", label: "Name" }, { key: "description", label: "Description", type: "textarea" }, { key: "department_id", label: "Department", type: "select", options: deptOpts }, { key: "lead_id", label: "Team lead (supervises members)", type: "select", options: peopleOpts }]} />
              </div>
            )}
            {tab === "roles" && (
              <div className="grid gap-8 xl:grid-cols-2">
                <div className="space-y-3 text-sm">
                  <h3 className="font-medium">User roles</h3>
                  {Object.entries(ROLE_LABELS).map(([k, l]) => (
                    <div key={k} className="rounded-md border p-3">
                      <p className="font-medium">{l} <span className="text-muted-foreground">· {counts[k] ?? 0} active</span></p>
                      <p className="text-xs text-muted-foreground">
                        {k === "admin" && "Full access: employees, all tasks, reviews, reports, settings and audit log."}
                        {k === "team_lead" && "Creates and reviews tasks for members of teams they lead and their direct reports; team reports and reviews."}
                        {k === "employee" && "Own tasks, progress updates, submissions, daily planner and personal performance."}
                      </p>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Change a person&apos;s role from Employees → Edit. Permissions are enforced by database Row Level Security.</p>
                </div>
                <DesignationsForm value={settings.designations ?? []} />
              </div>
            )}
            {tab === "categories" && (
              <ReferenceManager table="categories" title="Categories" canToggle rows={(cats.data ?? []) as never}
                fields={[{ key: "group_name", label: "Group (e.g. Recruitment)" }, { key: "name", label: "Category name" }, { key: "description", label: "Description", type: "textarea" }, { key: "color", label: "Colour", type: "color" }]} />
            )}
            {tab === "workflow" && <LabelsForm priorities={settings.priorities} statuses={settings.statuses} />}
            {tab === "performance" && (
              <div className="grid gap-8 xl:grid-cols-2">
                <div className="space-y-2"><h3 className="font-medium">KPI weights</h3><KpiWeightsForm value={settings.kpi_weights} /></div>
                <div className="space-y-8">
                  <div className="space-y-2"><h3 className="font-medium">Evaluation scale & fairness rules</h3>
                    <EvaluationForm scale={settings.evaluation_scale.max} labels={settings.evaluation_scale.labels ?? {}} rules={settings.performance_rules} /></div>
                  <div className="space-y-2"><h3 className="font-medium">Performance categories</h3><BandsForm value={settings.performance_bands} /></div>
                </div>
              </div>
            )}
            {tab === "time" && <WorkingTimeForm value={settings.working_time} workload={settings.workload} />}
            {tab === "reminders" && <RemindersForm value={settings.reminders} />}
            {tab === "data" && <MaintenancePanel hasDemo={(demo.count ?? 0) > 0} hasServiceKey={hasServiceRoleKey()} />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
