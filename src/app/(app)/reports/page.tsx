import type { Metadata } from "next";
import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { REPORTS } from "@/lib/reports";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireRole(["admin", "team_lead"]);
  return (
    <>
      <PageHeader title="Reports & analytics" description="Every report supports date-range and department/employee filters, Excel-compatible CSV export and print-friendly output." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r, i) => (
          <Link key={r.slug} href={`/reports/${r.slug}`}>
            <Card className="h-full transition-colors hover:border-info/50">
              <CardContent className="flex gap-3 pt-5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-primary"><FileBarChart className="size-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Report {i + 1}</p>
                  <h2 className="font-semibold">{r.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
