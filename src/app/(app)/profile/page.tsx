import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileForms } from "@/components/profile/profile-forms";
import { EMPLOYMENT_STATUS_LABELS, ROLE_LABELS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const me = await requireUser();
  const rows: [string, React.ReactNode][] = [
    ["Employee ID", me.employee_code], ["E-mail", me.email], ["Designation", me.designation ?? "—"], ["Department", me.department_name ?? "—"],
    ["Role", ROLE_LABELS[me.role]], ["Employment status", EMPLOYMENT_STATUS_LABELS[me.employment_status]], ["Joining date", fmtDate(me.joining_date)],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="My profile" description="Your record is maintained by HR. You can update your phone number and password here." />
      <Card>
        <CardHeader><CardTitle>{me.full_name}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-sm">{v}</dd></div>)}
          </dl>
          <p className="mt-4 text-sm"><Link href={`/performance/${me.id}`} className="text-info hover:underline">View my performance statistics →</Link></p>
        </CardContent>
      </Card>
      <ProfileForms phone={me.phone ?? ""} />
    </div>
  );
}
