import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { findReport } from "@/lib/reports";
import { buildReportContext, formatCell } from "@/lib/report-context";
import { getFormOptions } from "@/lib/queries/options";
import { getSettings } from "@/lib/settings";
import { PERIOD_PRESETS } from "@/lib/domain/periods";
import { withParams, type SearchParams } from "@/lib/search-params";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { Callout, PrintButton } from "@/components/shared/misc";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const def = findReport(slug);
  if (!def) notFound();
  const me = await requireRole(["admin", "team_lead"]);
  const sparams = await searchParams;
  const supabase = await createClient();
  const [ctx, options, settings] = await Promise.all([buildReportContext(def, sparams), getFormOptions(me), getSettings()]);
  const result = await def.run(supabase, ctx);
  const csvHref = withParams(`/api/reports/${slug}`, sparams, { period: ctx.preset, from: ctx.from, to: ctx.to });
  const employeeName = options.allPeople.find((p) => p.id === ctx.employee)?.label;

  return (
    <>
      <Link href="/reports" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-no-print><ArrowLeft className="size-4" /> All reports</Link>
      <div className="print-only mb-4">
        <p className="text-lg font-semibold">{settings.company.name}</p>
        <p className="text-xs">Generated {fmtDateTime(new Date())} by {me.full_name}</p>
      </div>
      <PageHeader
        title={def.title}
        description={
          <>
            {def.usesPeriod && <>Period: <strong>{fmtDate(ctx.from)} – {fmtDate(ctx.to)}</strong> ({ctx.label}). </>}
            {employeeName && <>Employee: <strong>{employeeName}</strong>. </>}
            {result.rows.length} row(s).
          </>
        }
        actions={
          <>
            <Button size="sm" variant="outline" asChild><a href={csvHref}><Download /> Export CSV (Excel)</a></Button>
            <PrintButton />
          </>
        }
      />
      <FilterBar
        searchKey={null}
        filters={[
          ...(def.usesPeriod ? [{ key: "period", label: "Period", options: PERIOD_PRESETS.filter((p) => p.value !== "custom").map((p) => ({ value: p.value, label: p.label })) }] : []),
          { key: "department", label: "Department", options: options.departments.map((d) => ({ value: d.id, label: d.label })) },
          { key: "employee", label: "Employee", options: options.employees.map((e) => ({ value: e.id, label: e.label })) },
        ]}
      >
        {def.usesPeriod && (
          <form className="flex items-center gap-1 text-sm" action={`/reports/${slug}`}>
            <input type="hidden" name="period" value="custom" />
            {ctx.department && <input type="hidden" name="department" value={ctx.department} />}
            {ctx.employee && <input type="hidden" name="employee" value={ctx.employee} />}
            <input type="date" name="from" defaultValue={ctx.from} className="h-9 rounded-md border px-2" aria-label="From" />
            <span>–</span>
            <input type="date" name="to" defaultValue={ctx.to} className="h-9 rounded-md border px-2" aria-label="To" />
            <Button size="sm" variant="outline">Apply</Button>
          </form>
        )}
      </FilterBar>
      {result.note && <Callout className="mb-4">{result.note}</Callout>}
      {def.needsEmployee && !ctx.employee ? (
        <EmptyState title="Select an employee" description="Use the Employee filter above to run this report." />
      ) : result.rows.length === 0 ? (
        <EmptyState title="No records for these filters" />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>{result.columns.map((c) => <TableHead key={c.key}>{c.header}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((r, i) => (
                <TableRow key={i}>
                  {result.columns.map((c) => (
                    <TableCell key={c.key} className={c.format && c.format !== "text" ? "whitespace-nowrap tabular-nums" : "max-w-xs"}>
                      {c.key === "task_code" && r.id ? <Link className="font-mono text-xs hover:underline" href={`/tasks/${r.id}`}>{String(r.task_code)}</Link> : formatCell(r[c.key], c.format)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
