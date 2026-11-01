import { requireUser, isManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getPeriod } from "@/lib/period";
import { getFormOptions } from "@/lib/queries/options";
import { SidebarNav } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { QuickAddTask } from "@/components/tasks/quick-add-task";
import type { Notification } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const supabase = await createClient();
  const [settings, period, unreadRes, recentRes, demoRes] = await Promise.all([
    getSettings(),
    getPeriod(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", me.id).eq("is_read", false),
    supabase.from("notifications").select("*").eq("user_id", me.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_demo", true),
  ]);
  const manager = isManager(me);
  const options = manager ? await getFormOptions(me) : null;
  const unread = unreadRes.count ?? 0;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block" data-no-print>
        <SidebarNav role={me.role} unread={unread} companyName={settings.company.name} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={{ id: me.id, full_name: me.full_name, email: me.email, role: me.role, designation: me.designation }}
          unread={unread}
          recent={(recentRes.data ?? []) as Notification[]}
          period={{ preset: period.preset, from: period.from, to: period.to, label: period.label }}
          companyName={settings.company.name}
          quickAdd={options ? <QuickAddTask options={options} today={period.today} /> : null}
        />
        {(demoRes.count ?? 0) > 0 && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900" data-no-print>
            Demonstration data is loaded (records marked <strong>Demo</strong>). It is not real company data
            {me.role === "admin" ? " – remove it in Settings → Data & maintenance once you go live." : "."}
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
