"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center">
      <AlertTriangle className="size-8 text-warning" />
      <h2 className="text-lg font-semibold">This page could not be loaded</h2>
      <p className="text-sm text-muted-foreground">
        {error.message?.includes("Supabase is not configured")
          ? error.message
          : "A temporary problem occurred while loading data. If it continues, check the database connection or contact your administrator."}
      </p>
      {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
