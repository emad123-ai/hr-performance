import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, endOfMonth, isISODate, isoWeekday, startOfQuarter, startOfWeek, todayInZone } from "../../src/lib/domain/dates.ts";
import { resolvePeriod, reviewPeriod } from "../../src/lib/domain/periods.ts";
import { capacityHours, remainingTaskHours, utilization, workingDaysInHorizon, workloadCategory } from "../../src/lib/domain/workload.ts";
import { csvEscape, toCsv } from "../../src/lib/domain/csv.ts";
import { allowedTaskActions, canMoveOnBoard } from "../../src/lib/domain/permissions.ts";
import { summarizePlan } from "../../src/lib/domain/planner.ts";

test("date helpers", () => {
  assert.equal(addDays("2026-02-27", 2), "2026-03-01");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(endOfMonth("2024-02-10"), "2024-02-29");
  assert.equal(isoWeekday("2026-10-31"), 6); // Saturday
  assert.equal(startOfWeek("2026-10-31"), "2026-10-26");
  assert.equal(startOfQuarter("2026-11-15"), "2026-10-01");
  assert.ok(isISODate("2026-12-31"));
  assert.ok(!isISODate("2026-02-30"));
  assert.equal(todayInZone("Asia/Karachi", new Date("2026-10-31T20:30:00Z")), "2026-11-01");
});

test("period presets", () => {
  const t = "2026-10-31";
  assert.deepEqual([resolvePeriod("this_month", t).from, resolvePeriod("this_month", t).to], ["2026-10-01", "2026-10-31"]);
  assert.deepEqual([resolvePeriod("last_month", t).from, resolvePeriod("last_month", t).to], ["2026-09-01", "2026-09-30"]);
  assert.equal(resolvePeriod("this_week", t).from, "2026-10-26");
  assert.equal(resolvePeriod("last_30", t).from, "2026-10-02");
  assert.equal(resolvePeriod("custom", t, "2026-01-01", "2026-03-31").to, "2026-03-31");
  assert.equal(resolvePeriod("custom", t, "2026-05-01", "2026-04-01").from, "2026-10-01", "invalid custom range falls back");
  assert.equal(resolvePeriod("bogus", t).preset, "this_month");
  assert.equal(resolvePeriod("this_year", t).granularity, "month");
});

test("review periods incl. fiscal years", () => {
  assert.deepEqual(reviewPeriod("monthly", "2026-10-15"), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(reviewPeriod("quarterly", "2026-08-15"), { from: "2026-07-01", to: "2026-09-30" });
  assert.deepEqual(reviewPeriod("annual", "2026-03-15", 7), { from: "2025-07-01", to: "2026-06-30" });
});

test("workload: capacity, shared tasks and categories", () => {
  // Sat 31 Oct 2026, 10-day horizon, Mon–Fri → Nov 2–6 and Nov 9 = 6 working days
  assert.equal(workingDaysInHorizon("2026-10-31", 10), 6);
  assert.equal(capacityHours({ workingDaysInHorizon: 6, hoursPerDay: 8, workingDaysPerWeek: 5 }), 48);
  assert.equal(capacityHours({ workingDaysInHorizon: 6, hoursPerDay: 8, weeklyCapacityOverride: 20, workingDaysPerWeek: 5 }), 24);
  assert.equal(remainingTaskHours(20, 50, 1), 10);
  assert.equal(remainingTaskHours(12, 0, 2), 6, "shared task split equally");
  assert.equal(remainingTaskHours(null, 0, 1), 4, "default estimate");
  assert.equal(utilization(59, 48), 122.9);
  assert.equal(workloadCategory(122.9), "Overloaded");
  assert.equal(workloadCategory(100), "High Workload");
  assert.equal(workloadCategory(90), "Balanced");
  assert.equal(workloadCategory(10), "Underutilized");
  assert.equal(workloadCategory(utilization(5, 0)), "No capacity");
});

test("equal task counts are not equal workloads", () => {
  const a = remainingTaskHours(2, 0, 1) * 3; // three small tasks
  const b = remainingTaskHours(16, 0, 1) * 3; // three large tasks
  assert.notEqual(workloadCategory(utilization(a, 48)), workloadCategory(utilization(b, 48)));
});

test("CSV is Excel-friendly and injection-safe", () => {
  assert.equal(csvEscape('He said "hi"'), '"He said ""hi"""');
  assert.equal(csvEscape("a,b"), '"a,b"');
  assert.equal(csvEscape("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvEscape("-12.5"), "-12.5");
  assert.equal(csvEscape(["x", "y"]), '"x; y"');
  const csv = toCsv([{ a: 1, b: "two" }], [{ key: "a", header: "A" }, { key: "b", header: "B" }]);
  assert.ok(csv.startsWith("﻿A,B\r\n1,two"));
});

test("UI permissions mirror the database workflow", () => {
  const emp = allowedTaskActions({ role: "employee", status: "in_progress", isAssignee: true, canManage: false });
  assert.deepEqual(emp.sort(), ["submit", "update_progress"]);
  assert.ok(!allowedTaskActions({ role: "employee", status: "completed", isAssignee: true, canManage: false }).includes("reopen"));
  const mgr = allowedTaskActions({ role: "team_lead", status: "under_review", isAssignee: false, canManage: true });
  assert.ok(mgr.includes("approve") && mgr.includes("request_changes") && !mgr.includes("update_progress"));
  assert.ok(allowedTaskActions({ role: "admin", status: "completed", isAssignee: false, canManage: true }).includes("reopen"));
  assert.equal(canMoveOnBoard("in_progress", "completed", { isAssignee: true, canManage: false }), false);
  assert.equal(canMoveOnBoard("in_progress", "under_review", { isAssignee: true, canManage: false }), true);
  assert.equal(canMoveOnBoard("completed", "in_progress", { isAssignee: false, canManage: true }), false);
});

test("daily plan summary", () => {
  const s = summarizePlan([
    { status: "completed", estimated_hours: 2, actual_hours: 2.5 },
    { status: "pending", estimated_hours: 3, actual_hours: null },
    { status: "blocked", estimated_hours: 1, actual_hours: 0.5 },
    { status: "planned", estimated_hours: null, actual_hours: null },
  ]);
  assert.deepEqual(s, { planned: 4, completed: 1, pending: 2, blocked: 1, estimatedHours: 6, actualHours: 3, completionPct: 25 });
  assert.equal(summarizePlan([]).completionPct, null);
});
