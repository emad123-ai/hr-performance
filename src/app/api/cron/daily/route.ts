import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Optional daily job for deployments without pg_cron (Vercel Hobby allows one run per day).
 * Vercel sends "Authorization: Bearer $CRON_SECRET". pg_cron inside Supabase is the primary scheduler.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const [checks, snapshot] = await Promise.all([admin.rpc("run_deadline_checks"), admin.rpc("record_workload_snapshot")]);
    if (checks.error || snapshot.error) throw new Error(checks.error?.message ?? snapshot.error?.message);
    return NextResponse.json({ ok: true, checks: checks.data, workload_rows: snapshot.data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
