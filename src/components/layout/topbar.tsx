"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Menu, Plus, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/actions/auth";
import { ROLE_SHORT } from "@/lib/constants";
import { initials } from "@/lib/utils";
import type { Notification, Role } from "@/lib/types";
import { SidebarNav } from "./app-sidebar";
import { NotificationBell } from "./notification-bell";
import { PeriodSelector } from "./period-selector";

interface TopbarProps {
  user: { id: string; full_name: string; email: string; role: Role; designation: string | null };
  unread: number;
  recent: Notification[];
  period: { preset: string; from: string; to: string; label: string };
  companyName: string;
  quickAdd?: React.ReactNode;
}

export function Topbar({ user, unread, recent, period, companyName, quickAdd }: TopbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-white/95 px-3 backdrop-blur md:px-5" data-no-print>
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
        <Menu />
      </Button>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent side="left" className="w-64 border-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SidebarNav role={user.role} unread={unread} companyName={companyName} onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>

      <form
        className="relative max-w-md flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q")?.toString().trim();
          if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" type="search" placeholder="Search tasks, people, projects…" className="h-9 bg-muted/50 pl-8" aria-label="Search" />
      </form>

      <div className="ml-auto flex items-center gap-1 md:gap-2">
        <PeriodSelector {...period} />
        {quickAdd}
        <NotificationBell userId={user.id} initialUnread={unread} initialItems={recent} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md p-1 hover:bg-muted" aria-label="Account menu">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                {initials(user.full_name)}
              </span>
              <span className="hidden text-left leading-tight xl:block">
                <span className="block text-sm font-medium">{user.full_name}</span>
                <span className="block text-[11px] text-muted-foreground">{ROLE_SHORT[user.role]}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium text-foreground">{user.full_name}</p>
              <p className="truncate text-xs">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile"><UserRound /> My profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/profile#security"><KeyRound /> Change password</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOut()} className="text-destructive focus:text-destructive">
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function QuickAddButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" onClick={onClick} className="gap-1">
      <Plus /> <span className="hidden sm:inline">Quick add task</span>
    </Button>
  );
}
