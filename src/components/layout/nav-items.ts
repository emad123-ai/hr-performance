import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: "dashboard" | "my-tasks" | "team-tasks" | "planner" | "employees" | "projects" | "performance" | "workload" | "reports" | "notifications" | "settings";
  roles: Role[];
}

const ALL: Role[] = ["admin", "team_lead", "employee"];
const MANAGERS: Role[] = ["admin", "team_lead"];

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL },
  { href: "/tasks/my", label: "My Tasks", icon: "my-tasks", roles: ALL },
  { href: "/tasks", label: "Team Tasks", icon: "team-tasks", roles: MANAGERS },
  { href: "/planner", label: "Daily Planner", icon: "planner", roles: ALL },
  { href: "/employees", label: "Employees", icon: "employees", roles: MANAGERS },
  { href: "/projects", label: "Projects", icon: "projects", roles: ALL },
  { href: "/performance", label: "Performance", icon: "performance", roles: ALL },
  { href: "/workload", label: "Workload", icon: "workload", roles: MANAGERS },
  { href: "/reports", label: "Reports", icon: "reports", roles: MANAGERS },
  { href: "/notifications", label: "Notifications", icon: "notifications", roles: ALL },
  { href: "/settings", label: "Settings", icon: "settings", roles: ["admin"] },
];
