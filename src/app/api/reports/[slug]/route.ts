import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { employeeDirectoryReport, findReport } from "@/lib/reports";
import { buildReportContext } from "@/lib/report-context";
import { toCsv } from "@/lib/domain/csv";

/** CSV export (UTF-8 with BOM → opens correctly in Excel). Runs with the user's session, so RLS applies. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await getCurrentUser();
  if (!me || !me.is_active) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (me.role === "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const sparams = Object.fromEntries(request.nextUrl.searchParams.entries());
  let result;
  let name = slug;
  try {
    if (slug === "employees") {
      result = await employeeDirectoryReport(supabase);
    } else {
      const def = findReport(slug);
      if (!def) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
      const ctx = await buildReportContext(def, sparams);
      result = await def.run(supabase, ctx);
      name = `${slug}_${ctx.from}_${ctx.to}`;
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const csv = toCsv(result.rows, result.columns.map((c) => ({ key: c.key, header: c.header })));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
