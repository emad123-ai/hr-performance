"use client";
import { Printer, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, initials } from "@/lib/utils";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer /> {label}
    </Button>
  );
}

export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  return (
    <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground", className)}>
      {initials(name)}
    </span>
  );
}

export function Callout({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger"; title?: string; children: React.ReactNode; className?: string }) {
  const styles = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
  }[tone];
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div className={cn("flex gap-2 rounded-md border p-3 text-sm", styles, className)} role={tone === "info" ? "note" : "alert"}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        {title && <p className="font-medium">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function FieldError({ message }: { message?: string | string[] }) {
  if (!message || (Array.isArray(message) && !message.length)) return null;
  return <p className="text-xs text-destructive">{Array.isArray(message) ? message[0] : message}</p>;
}
