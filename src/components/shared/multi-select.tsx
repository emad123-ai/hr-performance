"use client";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface MultiOption { id: string; label: string; hint?: string | null }

/** Accessible checkbox list with filter – no extra dependency. */
export function MultiSelect({
  options, value, onChange, placeholder = "Filter…", invalid, maxHeight = "max-h-44", id,
}: {
  options: MultiOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
  maxHeight?: string;
  id?: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => options.filter((o) => (o.label + " " + (o.hint ?? "")).toLowerCase().includes(q.toLowerCase())),
    [options, q],
  );
  const selected = options.filter((o) => value.includes(o.id));
  const toggle = (oid: string) => onChange(value.includes(oid) ? value.filter((v) => v !== oid) : [...value, oid]);

  return (
    <div className={cn("rounded-md border bg-white", invalid && "border-destructive")} id={id}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b p-2">
          {selected.map((o) => (
            <span key={o.id} className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs">
              {o.label}
              <button type="button" onClick={() => toggle(o.id)} aria-label={`Remove ${o.label}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="p-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-8" />
      </div>
      <ul className={cn("overflow-y-auto px-1 pb-1", maxHeight)} role="listbox" aria-multiselectable>
        {filtered.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">No matches</li>}
        {filtered.map((o) => (
          <li key={o.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
              <Checkbox checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
              <span className="flex-1">{o.label}</span>
              {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
