import "server-only";
import { cookies } from "next/headers";
import { resolvePeriod, type ResolvedPeriod } from "@/lib/domain/periods";
import { getToday } from "@/lib/settings";
import { sp, type SearchParams } from "@/lib/search-params";

export const PERIOD_COOKIE = "hrp_period";

/** Reporting period: URL (?period=&from=&to=) wins, then the top-bar date selector cookie, then "this month". */
export async function getPeriod(params?: SearchParams): Promise<ResolvedPeriod & { today: string }> {
  const today = await getToday();
  const store = await cookies();
  let preset = params ? sp(params, "period") : undefined;
  let from = params ? sp(params, "from") : undefined;
  let to = params ? sp(params, "to") : undefined;
  if (!preset) {
    const raw = store.get(PERIOD_COOKIE)?.value;
    if (raw) {
      const [p, f, t] = raw.split("|");
      preset = p;
      from = f || undefined;
      to = t || undefined;
    }
  }
  return { ...resolvePeriod(preset, today, from, to), today };
}
