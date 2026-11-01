"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { markNotificationsRead } from "@/lib/actions/preferences";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types";

/** Bell with live unread count (Supabase Realtime on the user's own notifications – RLS filtered). */
export function NotificationBell({ userId, initialUnread, initialItems }: { userId: string; initialUnread: number; initialItems: Notification[] }) {
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState(initialItems);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => setUnread(initialUnread), [initialUnread]);
  useEffect(() => setItems(initialItems), [initialItems]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => [n, ...prev].slice(0, 8));
          setUnread((u) => u + 1);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  function markAll() {
    startTransition(async () => {
      await markNotificationsRead();
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications (${unread} unread)`} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-4 text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm text-foreground">Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <button onClick={markAll} className="text-xs text-info hover:underline">Mark all read</button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>}
          {items.map((n) => (
            <Link
              key={n.id}
              href={n.link ?? "/notifications"}
              className={cn("block border-b px-3 py-2.5 text-sm last:border-0 hover:bg-muted/60", !n.is_read && "bg-accent/60")}
            >
              <p className={cn("line-clamp-1", !n.is_read && "font-medium")}>{n.title}</p>
              {n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
              <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtRelative(n.created_at)}</p>
            </Link>
          ))}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <Link href="/notifications" className="block px-3 py-2 text-center text-sm text-info hover:bg-muted/60">View all</Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
