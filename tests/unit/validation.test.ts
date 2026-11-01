import { test } from "node:test";
import assert from "node:assert/strict";
import { deadlineSchema, kpiWeightsSchema, newEmployeeSchema, progressSchema, reviewDecisionSchema, taskSchema } from "../../src/lib/validation/schemas.ts";

const uuid = "11111111-1111-4111-8111-111111111111";
const baseTask = { title: "Screen CVs", assignee_ids: [uuid], start_date: "2026-11-02", due_date: "2026-11-05", priority: "high", complexity: "2" };

test("task form: valid input normalises optional fields to null", () => {
  const r = taskSchema.safeParse({ ...baseTask, description: "", estimated_hours: "", project_id: "" });
  assert.ok(r.success);
  if (r.success) {
    assert.equal(r.data.description, null);
    assert.equal(r.data.estimated_hours, null);
    assert.equal(r.data.project_id, null);
    assert.equal(r.data.complexity, 2);
    assert.equal(r.data.assignment_mode, "shared");
  }
});

test("task form: parsed output re-validates on the server", () => {
  const first = taskSchema.parse({ ...baseTask, estimated_hours: "6" });
  const second = taskSchema.safeParse(first);
  assert.ok(second.success);
});

test("task form: due date before start date is rejected", () => {
  const r = taskSchema.safeParse({ ...baseTask, due_date: "2026-11-01" });
  assert.ok(!r.success);
  assert.equal(r.error?.issues[0].path[0], "due_date");
});

test("task form: requires an assignee and a real date", () => {
  assert.ok(!taskSchema.safeParse({ ...baseTask, assignee_ids: [] }).success);
  assert.ok(!taskSchema.safeParse({ ...baseTask, due_date: "2026-02-30" }).success);
});

test("blocking requires a note; approval requires a rating; changes require feedback", () => {
  assert.ok(!progressSchema.safeParse({ percentage: 50, status: "blocked", note: "" }).success);
  assert.ok(progressSchema.safeParse({ percentage: 50, status: "blocked", note: "Waiting for payroll" }).success);
  assert.ok(!reviewDecisionSchema.safeParse({ decision: "approve", quality: "", feedback: "" }).success);
  assert.ok(reviewDecisionSchema.safeParse({ decision: "approve", quality: "4", feedback: "" }).success);
  assert.ok(!reviewDecisionSchema.safeParse({ decision: "request_changes", feedback: "" }).success);
});

test("deadline changes require a reason", () => {
  assert.ok(!deadlineSchema.safeParse({ due_date: "2026-12-01", reason: "", cause: "none" }).success);
  assert.ok(deadlineSchema.safeParse({ due_date: "2026-12-01", reason: "Awaiting vendor", cause: "external" }).success);
});

test("KPI weights must total exactly 100", () => {
  assert.ok(kpiWeightsSchema.safeParse({ completion: 30, on_time: 25, quality: 20, ownership: 15, communication: 10 }).success);
  assert.ok(!kpiWeightsSchema.safeParse({ completion: 30, on_time: 25, quality: 20, ownership: 15, communication: 5 }).success);
});

test("new employee: strong temporary password and valid e-mail", () => {
  const base = { full_name: "Ali Raza", email: "ALI@Company.com", role: "employee", employment_status: "active" };
  assert.ok(!newEmployeeSchema.safeParse({ ...base, password: "short1" }).success);
  assert.ok(!newEmployeeSchema.safeParse({ ...base, password: "onlyletterspassword" }).success);
  const ok = newEmployeeSchema.safeParse({ ...base, password: "Welcome2026x" });
  assert.ok(ok.success);
  if (ok.success) assert.equal(ok.data.email, "ali@company.com");
  assert.ok(!newEmployeeSchema.safeParse({ ...base, role: "superuser", password: "Welcome2026x" }).success);
});
