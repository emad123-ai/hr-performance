"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.push("/dashboard");
  }, [state, router]);
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-xs">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
          <p className="text-xs text-muted-foreground">At least 10 characters, including letters and numbers.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        {state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
        <Button className="w-full" disabled={pending}>Update password</Button>
      </form>
    </div>
  );
}
