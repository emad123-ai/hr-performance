import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { APP_NAME } from "@/lib/constants";
import { BarChart3 } from "lucide-react";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const notice =
    params.error === "inactive" ? "Your account is inactive. Please contact HR." : params.reset === "1" ? "Password updated – please sign in." : null;
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="size-6" /> {APP_NAME}
        </div>
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold leading-tight">One place for team tasks, deadlines, workload and performance.</h1>
          <ul className="space-y-2 text-sm text-white/80">
            <li>• Assign and track work with a complete audit trail</li>
            <li>• Spot overdue tasks and overloaded people early</li>
            <li>• Fair, transparent performance scorecards</li>
          </ul>
        </div>
        <p className="text-xs text-white/60">Access is restricted to authorised staff.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary lg:hidden">
              <BarChart3 className="size-5" /> <span className="font-semibold">{APP_NAME}</span>
            </div>
            <h2 className="text-2xl font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use the e-mail and password provided by HR.</p>
          </div>
          {notice && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
          <LoginForm next={params.next} />
        </div>
      </div>
    </div>
  );
}
