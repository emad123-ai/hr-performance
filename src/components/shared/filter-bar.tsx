"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/** URL-driven search + filters: every change updates the query string, the server re-queries the database. */
export function FilterBar({ filters = [], searchPlaceholder = "Search…", searchKey = "q", children }: {
  filters?: FilterDef[];
  searchPlaceholder?: string;
  searchKey?: string | null;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(searchKey ? params.get(searchKey) ?? "" : "");

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (!searchKey) return;
    const current = params.get(searchKey) ?? "";
    if (q === current) return;
    const t = setTimeout(() => update({ [searchKey]: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = filters.some((f) => params.get(f.key)) || (searchKey && params.get(searchKey));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-no-print aria-busy={pending}>
      {searchKey && (
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="pl-8" aria-label={searchPlaceholder} />
        </div>
      )}
      {filters.map((f) => (
        <NativeSelect
          key={f.key}
          aria-label={f.label}
          className="w-auto min-w-36"
          value={params.get(f.key) ?? ""}
          onChange={(e) => update({ [f.key]: e.target.value || null })}
        >
          <option value="">{f.label}: All</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </NativeSelect>
      ))}
      {children}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            update(Object.fromEntries([...filters.map((f) => [f.key, null]), ...(searchKey ? [[searchKey, null]] : [])]));
          }}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
