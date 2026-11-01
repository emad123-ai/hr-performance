import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryFor, DEFAULT_WEIGHTS, kpiInsights, previewReview, ratingToPercent, validateWeights, weightedScore } from "../../src/lib/domain/scoring.ts";

test("rating conversion uses rating / scale × 100", () => {
  assert.equal(ratingToPercent(4, 5), 80);
  assert.equal(ratingToPercent(3, 5), 60);
  assert.equal(ratingToPercent(7, 10), 70);
  assert.equal(ratingToPercent(null, 5), null);
});

test("weights must be non-negative and total 100", () => {
  assert.equal(validateWeights(DEFAULT_WEIGHTS), null);
  assert.match(validateWeights({ ...DEFAULT_WEIGHTS, completion: 40 }) ?? "", /total 100/);
  assert.match(validateWeights({ ...DEFAULT_WEIGHTS, completion: -5, on_time: 60 }) ?? "", /non-negative/);
});

test("weighted score matches the database for a complete review (demo: Ayesha = 88.00)", () => {
  // completion 100, on-time 80, quality 80 (task ratings), ownership 4/5, communication 5/5
  const r = weightedScore({ completion: 100, on_time: 80, quality: 80, ownership: 80, communication: 100 });
  assert.equal(r.score, 88);
  assert.equal(r.weightCovered, 100);
});

test("manager quality override replaces task-rating average (demo: Hira = 84.00)", () => {
  const p = previewReview({
    completionRate: 100, onTimeRate: 100, taskQualityScore: 80, qualityRating: 3, ownershipRating: 3, communicationRating: 4,
    eligibleTasks: 5, scale: 5,
  });
  assert.equal(p.score, 84);
  assert.equal(p.category, "Very Good");
  assert.equal(p.provisional, false);
});

test("missing components are excluded and weights re-normalised, with a warning (demo draft: Bilal = 81.33)", () => {
  const p = previewReview({
    completionRate: 100, onTimeRate: 60, taskQualityScore: 80, qualityRating: null, ownershipRating: null, communicationRating: null,
    eligibleTasks: 5, scale: 5,
  });
  assert.equal(p.score, 81.33);
  assert.equal(p.weightCovered, 75);
  assert.ok(p.provisional);
  assert.ok(p.warnings.some((w) => w.includes("75%")));
});

test("low task count is 'Insufficient data', never a poor-performance label", () => {
  const p = previewReview({
    completionRate: 0, onTimeRate: 0, taskQualityScore: null, qualityRating: null, ownershipRating: 1, communicationRating: 1,
    eligibleTasks: 1, scale: 5,
  });
  assert.equal(p.category, "Insufficient data");
  assert.ok(p.provisional);
});

test("a single missed deadline among enough tasks does not by itself make someone Unsatisfactory", () => {
  // 3 tasks, one missed: completion 66.7 (effort-weighted could differ), on-time 66.7, good quality and ratings
  const p = previewReview({
    completionRate: 66.67, onTimeRate: 66.67, taskQualityScore: 80, qualityRating: null, ownershipRating: 4, communicationRating: 4,
    eligibleTasks: 3, scale: 5,
  });
  assert.notEqual(p.category, "Unsatisfactory");
});

test("categories follow configurable bands", () => {
  assert.equal(categoryFor(95), "Excellent");
  assert.equal(categoryFor(90), "Excellent");
  assert.equal(categoryFor(89.99), "Very Good");
  assert.equal(categoryFor(70), "Good");
  assert.equal(categoryFor(60), "Needs Improvement");
  assert.equal(categoryFor(59.9), "Unsatisfactory");
  assert.equal(categoryFor(75, [{ min: 0, label: "Low" }, { min: 75, label: "High" }]), "High");
  assert.equal(categoryFor(null), null);
});

test("insights flag strong and weak KPIs", () => {
  const i = kpiInsights({ completion: 95, on_time: 50, quality: 70, ownership: null, communication: 90 });
  assert.deepEqual(i.strengths, ["Task completion", "Communication & coordination"]);
  assert.deepEqual(i.improvements, ["On-time delivery"]);
});
