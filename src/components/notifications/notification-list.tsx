"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteNotification, markNotificationsRead, saveNotificationPreferences } from "@/lib/actions/preferences";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NOTIFICATION_TYPES } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActionResult, Notification } from "@/lib/types";

export function NotificationList({ items }: { items: Notification[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>) => start(async () => {
    const res = await fn();
    if (!res.ok) toast.error(res.error);
    router.refresh();
  });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" disabled={pending || !items.some((n) => !n.is_read)} onClick={() => run(() => markNotificationsRead())}><CheckCheck /> Mark all as read</Button>
      </div>
      <ul className="divide-y rounded-lg border bg-card">
        {items.map((n) => (
          <li key={n.id} className={cn("flex items-start gap-3 p-3", !n.is_read && "bg-accent/40")}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-info")} aria-label={n.is_read ? "Read" : "Unread"} />
            <div className="min-w-0 flex-1">
              {n.link ? (
                <Link href={n.link} onClick={() => !n.is_read && markNotificationsRead([n.id])} className={cn("hover:underline", !n.is_read && "font-medium")}>{n.title}</Link>
              ) : <p className={cn(!n.is_read && "font-medium")}>{n.title}</p>}
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="text-xs text-muted-foreground">{fmtDateTime(n.created_at)} · {NOTIFICATION_TYPES.find((t) => t.type === n.type)?.label ?? n.type}</p>
            </div>
            {!n.is_read && <Button size="icon-sm" variant="ghost" aria-label="Mark as read" onClick={() => run(() => markNotificationsRead([n.id]))}><Check /></Button>}
            <Button size="icon-sm" variant="ghost" aria-label="Delete" onClick={() => run(() => deleteNotification(n.id))}><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NotificationPreferences({ disabled }: { disabled: string[] }) {
  const [off, setOff] = useState<string[]>(disabled);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {NOTIFICATION_TYPES.map((t) => (
          <li key={t.type}>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={!off.includes(t.type)} onChange={(e) => setOff((o) => (e.target.checked ? o.filter((x) => x !== t.type) : [...o, t.type]))} />
              {t.label}
            </label>
          </li>
        ))}
      </ul>
      <Button size="sm" disabled={pending} onClick={() => start(async () => {
        const res = await saveNotificationPreferences(off);
        if (res.ok) toast.success(res.message ?? "Saved"); else toast.error(res.error);
      })}>Save preferences</Button>
      <p className="text-xs text-muted-foreground">In-app notifications are free and need no e-mail service. E-mail delivery is optional – see the deployment guide.</p>
    </div>
  );
}
