"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { PERIOD_PRESETS } from "@/lib/domain/periods";
import { setPeriod } from "@/lib/actions/preferences";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";

/** Global reporting-period selector (stored in a cookie; dashboards and reports use it as their default). */
export function PeriodSelector({ preset, from, to, label }: { preset: string; from: string; to: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({ from, to });
  const [pending, start] = useTransition();
  const router = useRouter();

  function apply(p: string, f?: string, t?: string) {
    start(async () => {
      const res = await setPeriod(p, f, t);
      if (!res.ok) toast.error(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="hidden items-center gap-1.5 md:flex">
        <CalendarRange className="size-4 text-muted-foreground" />
        <NativeSelect
          aria-label="Reporting period"
          className="h-8 w-40 text-xs"
          value={preset}
          disabled={pending}
          onChange={(e) => (e.target.value === "custom" ? setOpen(true) : apply(e.target.value))}
        >
          {PERIOD_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.value === "custom" && preset === "custom" ? label : p.label}</option>
          ))}
        </NativeSelect>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Custom period</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf">From</Label>
              <Input id="pf" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pt">To</Label>
              <Input id="pt" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending} onClick={() => apply("custom", range.from, range.to)}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
