// CSV generation that opens cleanly in Excel (UTF-8 BOM, CRLF, quoted fields, formula-injection safe).

export interface CsvColumn<T> {
  key: string;
  header: string;
  value?: (row: T) => unknown;
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (Array.isArray(value)) s = value.join("; ");
  else if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  // Prevent CSV/Excel formula injection for text that starts with a formula character
  if (FORMULA_PREFIX.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  if (/[",\r\n;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], withBom = true): string {
  const header = columns.map((c) => csvEscape(c.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(c.value ? c.value(row) : (row as Record<string, unknown>)[c.key])).join(","),
  );
  return (withBom ? "﻿" : "") + [header, ...lines].join("\r\n") + "\r\n";
}
