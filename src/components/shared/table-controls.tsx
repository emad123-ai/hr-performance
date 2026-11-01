import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { withParams, type SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

/** Server-rendered sortable column header (sorting happens in the database query). */
export function SortableHead({
  label, column, basePath, params, current, dir, className,
}: { label: string; column: string; basePath: string; params: SearchParams; current: string; dir: "asc" | "desc"; className?: string }) {
  const active = current === column;
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={withParams(basePath, params, { sort: column, dir: nextDir, page: null })} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {label} <Icon className="size-3" />
      </Link>
    </TableHead>
  );
}

export function Pagination({ basePath, params, page, pageSize, total }: { basePath: string; params: SearchParams; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-2 border-t px-3 py-2.5 text-sm text-muted-foreground" data-no-print>
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" asChild={page > 1} disabled={page <= 1} aria-label="Previous page">
          {page > 1 ? <Link href={withParams(basePath, params, { page: page - 1 })}><ChevronLeft /></Link> : <ChevronLeft />}
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="outline" size="icon-sm" asChild={page < pages} disabled={page >= pages} aria-label="Next page">
          {page < pages ? <Link href={withParams(basePath, params, { page: page + 1 })}><ChevronRight /></Link> : <ChevronRight />}
        </Button>
      </div>
    </div>
  );
}
