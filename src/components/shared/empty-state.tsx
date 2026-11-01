import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title, description, action, icon: Icon = Inbox, className,
}: { title: string; description?: string; action?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-white/60 px-6 py-12 text-center", className)}>
      <Icon className="size-8 text-muted-foreground/60" />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
