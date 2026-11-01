import Link from "next/link";
import { CalendarDays, Columns3, Table2 } from "lucide-react";
import { withParams, type SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

const VIEWS = [
  { value: "table", label: "Table", icon: Table2 },
  { value: "kanban", label: "Board", icon: Columns3 },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
] as const;

export function ViewSwitcher({ basePath, params, current }: { basePath: string; params: SearchParams; current: string }) {
  return (
    <div className="inline-flex rounded-md border bg-white p-0.5" role="tablist" aria-label="Task view">
      {VIEWS.map((v) => (
        <Link
          key={v.value}
          role="tab"
          aria-selected={current === v.value}
          href={withParams(basePath, params, { view: v.value === "table" ? null : v.value, page: null })}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm",
            current === v.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <v.icon className="size-4" /> {v.label}
        </Link>
      ))}
    </div>
  );
}
