"use client";
import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-xs">
        <h1 className="text-xl font-semibold">Reset password</h1>
        <p className="text-sm text-muted-foreground">Enter your work e-mail and we will send you a reset link.</p>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        {state && <p className={state.ok ? "text-sm text-success" : "text-sm text-destructive"}>{state.ok ? state.message : state.error}</p>}
        <Button className="w-full" disabled={pending}>Send reset link</Button>
        <p className="text-center text-sm">
          <Link href="/login" className="text-info hover:underline">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
