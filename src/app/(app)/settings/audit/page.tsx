import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sp, spPage, type SearchParams } from "@/lib/search-params";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/table-controls";
import { EmptyState } from "@/components/shared/empty-state";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };
const ENTITIES = ["profiles", "departments", "teams", "categories", "projects", "project_members", "system_settings", "performance_reviews"];
const PAGE = 50;

function summarize(action: string, details: Record<string, unknown> | null) {
  if (!details) return "";
  if (action === "update") {
    return Object.entries(details).map(([k, v]) => {
      const c = v as { old: unknown; new: unknown };
      const show = (x: unknown) => (x === null ? "∅" : typeof x === "object" ? JSON.stringify(x).slice(0, 60) : String(x).slice(0, 60));
      return `${k}: ${show(c.old)} → ${show(c.new)}`;
    }).join(" · ");
  }
  const name = (details.full_name ?? details.name ?? details.title ?? details.key ?? "") as string;
  return name ? String(name) : "";
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const page = spPage(params);
  const supabase = await createClient();
  let q = supabase.from("audit_logs").select("*", { count: "exact" });
  const entity = sp(params, "entity");
  if (entity && ENTITIES.includes(entity)) q = q.eq("entity_type", entity);
  const action = sp(params, "action");
  if (action && ["insert", "update", "delete"].includes(action)) q = q.eq("action", action);
  const { data, count } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const actorIds = [...new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const names = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  return (
    <>
      <Link href="/settings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Settings</Link>
      <PageHeader title="Audit log" description="Append-only record of changes to employees, organisation data, projects, settings and reviews. Task changes are in each task's activity history." />
      <FilterBar searchKey={null} filters={[
        { key: "entity", label: "Record type", options: ENTITIES.map((e) => ({ value: e, label: e.replace(/_/g, " ") })) },
        { key: "action", label: "Action", options: ["insert", "update", "delete"].map((a) => ({ value: a, label: a })) },
      ]} />
      {(data ?? []).length === 0 ? <EmptyState title="No audit entries" /> : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Record</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</TableCell>
                  <TableCell className="text-sm">{r.actor_id ? names.get(r.actor_id) ?? "Unknown user" : "System"}</TableCell>
                  <TableCell className="text-xs uppercase">{r.action}</TableCell>
                  <TableCell className="text-xs">{String(r.entity_type).replace(/_/g, " ")}</TableCell>
                  <TableCell className="max-w-xl truncate text-xs text-muted-foreground" title={JSON.stringify(r.details)}>{summarize(r.action, r.details)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination basePath="/settings/audit" params={params} page={page} pageSize={PAGE} total={count ?? 0} />
        </div>
      )}
    </>
  );
}
