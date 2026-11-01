"use client";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { signOutEverywhere, updatePassword } from "@/lib/actions/auth";
import { updateMyPhone } from "@/lib/actions/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForms({ phone }: { phone: string }) {
  const [pending, start] = useTransition();
  const [pwState, pwAction, pwPending] = useActionState(updatePassword, null);
  return (
    <>
      <Card>
        <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
        <CardContent>
          <form className="flex max-w-md items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            const v = String(new FormData(e.currentTarget).get("phone") ?? "");
            start(async () => { const r = await updateMyPhone(v); if (r.ok) toast.success(r.message ?? "Saved"); else toast.error(r.error); });
          }}>
            <div className="flex-1 space-y-1.5"><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" defaultValue={phone} /></div>
            <Button disabled={pending}>Save</Button>
          </form>
        </CardContent>
      </Card>
      <Card id="security">
        <CardHeader><CardTitle>Security</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <form action={pwAction} className="grid max-w-md gap-3">
            <div className="space-y-1.5"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></div>
            <div className="space-y-1.5"><Label htmlFor="confirm">Confirm new password</Label><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div>
            {pwState && <p className={pwState.ok ? "text-sm text-success" : "text-sm text-destructive"}>{pwState.ok ? pwState.message : pwState.error}</p>}
            <Button className="w-fit" disabled={pwPending}>Change password</Button>
          </form>
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">Signed in on a shared or lost device? End every active session.</p>
            <form action={signOutEverywhere}><Button variant="outline">Sign out of all devices</Button></form>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
