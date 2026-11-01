// Dependency-free date helpers working on ISO "YYYY-MM-DD" strings (calendar dates, no time zone drift).

export type ISODate = string;

export function toISO(d: Date): ISODate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISO(d) === s;
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toISO(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86_400_000);
}

/** ISO weekday: 1 = Monday … 7 = Sunday */
export function isoWeekday(s: ISODate): number {
  const wd = parseISODate(s).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function startOfWeek(s: ISODate): ISODate {
  return addDays(s, 1 - isoWeekday(s));
}

export function startOfMonth(s: ISODate): ISODate {
  return s.slice(0, 8) + "01";
}

export function endOfMonth(s: ISODate): ISODate {
  return addDays(addMonths(startOfMonth(s), 1), -1);
}

export function startOfQuarter(s: ISODate): ISODate {
  const d = parseISODate(s);
  const qMonth = Math.floor(d.getUTCMonth() / 3) * 3;
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), qMonth, 1)));
}

export function startOfYear(s: ISODate): ISODate {
  return s.slice(0, 4) + "-01-01";
}

/** Today's calendar date in a given IANA time zone. */
export function todayInZone(timeZone = "UTC", now: Date = new Date()): ISODate {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    return parts; // en-CA formats as YYYY-MM-DD
  } catch {
    return toISO(now);
  }
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
