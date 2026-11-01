"use client";
// Chart primitives (Recharts). Palette follows the validated categorical order
// (blue → orange → aqua) – status colours are only used where the mark *is* a status
// and every bar carries a text label, so colour is never the only identifier.
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export const SERIES = { blue: "#2a78d6", orange: "#eb6834", aqua: "#1baf7a", red: "#e34948" } as const;
const AXIS = { fontSize: 11, fill: "#5b6b7f" };
const GRID = "#e6eaef";
const tooltipStyle = { borderRadius: 8, border: "1px solid #dde3ea", fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,.06)" };

export interface SeriesDef { key: string; label: string; color: string }

export function TrendChart({ data, xKey, series, height = 260, percent }: {
  data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number; percent?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} domain={percent ? [0, 100] : undefined} unit={percent ? "%" : undefined} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
        {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GroupedBarChart({ data, xKey, series, height = 280, percent, stacked }: {
  data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number; percent?: boolean; stacked?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }} barGap={2} barCategoryGap="28%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={data.length > 6 ? -25 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 56 : 30} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} domain={percent ? [0, 100] : undefined} unit={percent ? "%" : undefined} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(31,57,82,.05)" }} />
        {series.length > 1 && <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={28} stackId={stacked ? "a" : undefined}
            stroke="#fff" strokeWidth={stacked ? 2 : 0}
            radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars with category labels and value labels (each bar may carry its own semantic colour). */
export function LabeledBarList({ data, height, unit = "", max }: {
  data: { label: string; value: number; color: string }[]; height?: number; unit?: string; max?: number;
}) {
  const h = height ?? Math.max(120, data.length * 34 + 16);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }} barCategoryGap="22%">
        <XAxis type="number" hide domain={[0, max ?? "auto"]} />
        <YAxis type="category" dataKey="label" tick={{ ...AXIS, fill: "#0f1b2a" }} width={130} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(31,57,82,.05)" }} formatter={(v) => [`${v}${unit}`, "Value"]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((d) => <Cell key={d.label} fill={d.color} />)}
          <LabelList dataKey="value" position="right" formatter={(v: unknown) => `${v}${unit}`} style={{ fontSize: 11, fill: "#0f1b2a" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
