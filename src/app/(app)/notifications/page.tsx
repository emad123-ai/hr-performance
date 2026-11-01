import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, NOTIFICATION_TYPES } from "@/lib/constants";
import { sp, spPage, type SearchParams } from "@/lib/search-params";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/table-controls";
import { EmptyState } from "@/components/shared/empty-state";
import { NotificationList, NotificationPreferences } from "@/components/notifications/notification-list";
import type { Notification } from "@/lib/types";
import { BellOff } from "lucide-react";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireUser();
  const params = await searchParams;
  const page = spPage(params);
  const supabase = await createClient();
  let q = supabase.from("notifications").select("*", { count: "exact" }).eq("user_id", me.id);
  if (sp(params, "state") === "unread") q = q.eq("is_read", false);
  const type = sp(params, "type");
  if (type && NOTIFICATION_TYPES.some((t) => t.type === type)) q = q.eq("type", type);
  const [{ data, count }, prefs] = await Promise.all([
    q.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("notification_preferences").select("disabled_types").eq("user_id", me.id).maybeSingle(),
  ]);
  const items = (data ?? []) as Notification[];
  return (
    <>
      <PageHeader title="Notifications" description="Assignments, deadlines, submissions, approvals and other updates." />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FilterBar
            searchKey={null}
            filters={[
              { key: "state", label: "Show", options: [{ value: "unread", label: "Unread only" }] },
              { key: "type", label: "Type", options: NOTIFICATION_TYPES.map((t) => ({ value: t.type, label: t.label })) },
            ]}
          />
          {items.length === 0 ? <EmptyState icon={BellOff} title="No notifications" /> : (
            <>
              <NotificationList items={items} />
              <Pagination basePath="/notifications" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
            </>
          )}
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>Notification settings</CardTitle></CardHeader>
          <CardContent><NotificationPreferences disabled={(prefs.data?.disabled_types as string[]) ?? []} /></CardContent>
        </Card>
      </div>
    </>
  );
}
