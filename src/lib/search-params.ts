export type SearchParams = Record<string, string | string[] | undefined>;

export function sp(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s : undefined;
}

export function spPage(params: SearchParams): number {
  const n = Number(sp(params, "page") ?? "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Validated sort column + direction (only whitelisted columns reach the database). */
export function spSort<T extends string>(params: SearchParams, allowed: readonly T[], fallback: T, fallbackDir: "asc" | "desc" = "asc") {
  const s = sp(params, "sort") as T | undefined;
  const dir = sp(params, "dir") === "desc" ? "desc" : sp(params, "dir") === "asc" ? "asc" : fallbackDir;
  return { sort: s && allowed.includes(s) ? s : fallback, dir, ascending: dir === "asc" } as const;
}

export function isUuid(v: string | undefined): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Escapes user search text for PostgREST `ilike` / `or` filters. */
export function ilikeTerm(q: string): string {
  return `%${q.replace(/[%_\\]/g, (m) => "\\" + m).replace(/[,()]/g, " ").slice(0, 100)}%`;
}

export function withParams(base: string, params: SearchParams, patch: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") u.delete(k);
    else u.set(k, String(v));
  }
  const q = u.toString();
  return q ? `${base}?${q}` : base;
}
