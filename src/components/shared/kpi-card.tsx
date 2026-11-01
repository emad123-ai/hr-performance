import Link from "next/link";
import { cn } from "@/lib/utils";

const TONES = {
  default: "text-foreground",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

export function KpiCard({
  label, value, hint, href, tone = "default", icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  href?: string;
  tone?: keyof typeof TONES;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const body = (
    <div className={cn("flex h-full flex-col justify-between gap-2 rounded-lg border bg-card p-4 shadow-xs transition-colors", href && "hover:border-info/50 hover:bg-accent/30")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className={cn("size-4", TONES[tone])} />}
      </div>
      <p className={cn("text-2xl font-semibold tabular-nums", TONES[tone])}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      {body}
    </Link>
  ) : (
    body
  );
}
