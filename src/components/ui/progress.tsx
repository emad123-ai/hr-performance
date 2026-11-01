import { cn } from "@/lib/utils";

function Progress({ value, className, indicatorClassName }: { value: number | null | undefined; className?: string; indicatorClassName?: string }) {
  const v = Math.max(0, Math.min(100, Number(value ?? 0)));
  return (
    <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full bg-primary transition-all", indicatorClassName)} style={{ width: `${v}%` }} />
    </div>
  );
}

export { Progress };
