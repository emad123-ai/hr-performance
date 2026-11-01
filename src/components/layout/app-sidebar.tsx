"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bell, Briefcase, CalendarCheck, ClipboardList, FileBarChart, Gauge, LayoutDashboard, ListChecks, Settings, TrendingUp, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import type { Role } from "@/lib/types";
import { NAV_ITEMS, type NavItem } from "./nav-items";

const ICONS: Record<NavItem["icon"], React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  "my-tasks": ListChecks,
  "team-tasks": ClipboardList,
  planner: CalendarCheck,
  employees: Users,
  projects: Briefcase,
  performance: TrendingUp,
  workload: Gauge,
  reports: FileBarChart,
  notifications: Bell,
  settings: Settings,
};

export function isActive(pathname: string, href: string) {
  if (href === "/tasks") return pathname === "/tasks" || (pathname.startsWith("/tasks/") && !pathname.startsWith("/tasks/my"));
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ role, unread, onNavigate, companyName }: { role: Role; unread: number; onNavigate?: () => void; companyName: string }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <BarChart3 className="size-5 text-white" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{APP_NAME}</p>
          <p className="truncate text-[11px] text-sidebar-foreground/70">{companyName}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main">
        {NAV_ITEMS.filter((i) => i.roles.includes(role)).map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-sidebar-active font-medium text-white" : "text-sidebar-foreground/85 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.icon === "notifications" && unread > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <p className="border-t border-white/10 p-3 text-[11px] text-sidebar-foreground/60">Free stack · Next.js + Supabase</p>
    </div>
  );
}
