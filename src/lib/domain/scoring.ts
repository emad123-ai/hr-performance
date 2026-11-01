// Performance scoring rules – mirrors public.weighted_score / compute_review in the database.
// The database is authoritative (it recomputes on every save); this module powers live previews
// in the review form and is covered by unit tests so both stay in agreement.
import type { KpiWeights } from "../types";

export const DEFAULT_WEIGHTS: KpiWeights = { completion: 30, on_time: 25, quality: 20, ownership: 15, communication: 10 };

export interface Band { min: number; label: string }
export const DEFAULT_BANDS: Band[] = [
  { min: 90, label: "Excellent" },
  { min: 80, label: "Very Good" },
  { min: 70, label: "Good" },
  { min: 60, label: "Needs Improvement" },
  { min: 0, label: "Unsatisfactory" },
];

export function validateWeights(w: KpiWeights): string | null {
  const values = Object.values(w);
  if (values.some((v) => typeof v !== "number" || Number.isNaN(v) || v < 0)) return "Weights must be non-negative numbers";
  const total = values.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 1e-9) return `Weights must total 100 (currently ${total})`;
  return null;
}

/** Converts a rating on a 1..scale scale to a percentage (rating / scale × 100). */
export function ratingToPercent(rating: number | null | undefined, scale: number): number | null {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return null;
  if (scale <= 0) return null;
  return round2((rating / scale) * 100);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ScoreComponents {
  completion: number | null;
  on_time: number | null;
  quality: number | null;
  ownership: number | null;
  communication: number | null;
}

/** Weighted score over available components, re-normalising the weights of the missing ones. */
export function weightedScore(c: ScoreComponents, w: KpiWeights = DEFAULT_WEIGHTS): { score: number | null; weightCovered: number } {
  let sum = 0;
  let covered = 0;
  (Object.keys(w) as (keyof KpiWeights)[]).forEach((k) => {
    const v = c[k];
    if (v !== null && v !== undefined && !Number.isNaN(v)) {
      sum += v * w[k];
      covered += w[k];
    }
  });
  return { score: covered > 0 ? round2(sum / covered) : null, weightCovered: covered };
}

export function categoryFor(score: number | null, bands: Band[] = DEFAULT_BANDS): string | null {
  if (score === null) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => score >= b.min)?.label ?? null;
}

export interface ReviewPreviewInput {
  completionRate: number | null;
  onTimeRate: number | null;
  taskQualityScore: number | null; // already a percentage
  qualityRating: number | null; // manager override on scale
  ownershipRating: number | null;
  communicationRating: number | null;
  eligibleTasks: number;
  scale: number;
  weights?: KpiWeights;
  bands?: Band[];
  minTasks?: number;
}

export interface ReviewPreview {
  score: number | null;
  category: string | null;
  provisional: boolean;
  warnings: string[];
  components: ScoreComponents;
  weightCovered: number;
}

export function previewReview(i: ReviewPreviewInput): ReviewPreview {
  const minTasks = i.minTasks ?? 3;
  const components: ScoreComponents = {
    completion: i.completionRate,
    on_time: i.onTimeRate,
    quality: i.qualityRating !== null ? ratingToPercent(i.qualityRating, i.scale) : i.taskQualityScore,
    ownership: ratingToPercent(i.ownershipRating, i.scale),
    communication: ratingToPercent(i.communicationRating, i.scale),
  };
  const { score, weightCovered } = weightedScore(components, i.weights ?? DEFAULT_WEIGHTS);
  const warnings: string[] = [];
  if (i.eligibleTasks < minTasks) {
    warnings.push(`Only ${i.eligibleTasks} task(s) with a final outcome in this period (minimum ${minTasks}). Automatic metrics are not representative.`);
  }
  if (i.onTimeRate === null) warnings.push("No on-time delivery data for this period.");
  if (components.quality === null) warnings.push("No quality ratings available.");
  if (i.ownershipRating === null || i.communicationRating === null) warnings.push("Manager evaluation (ownership / communication) not yet entered.");
  if (weightCovered < 100) warnings.push(`Score calculated on ${weightCovered}% of the KPI weight; missing components were excluded.`);
  return {
    score,
    category: i.eligibleTasks < minTasks ? "Insufficient data" : categoryFor(score, i.bands),
    provisional: warnings.length > 0,
    warnings,
    components,
    weightCovered,
  };
}

/** Plain-language strengths / improvement hints derived from KPI scores (for manager guidance only). */
export function kpiInsights(c: ScoreComponents): { strengths: string[]; improvements: string[] } {
  const names: Record<keyof ScoreComponents, string> = {
    completion: "Task completion",
    on_time: "On-time delivery",
    quality: "Quality & accuracy",
    ownership: "Ownership & initiative",
    communication: "Communication & coordination",
  };
  const strengths: string[] = [];
  const improvements: string[] = [];
  (Object.keys(names) as (keyof ScoreComponents)[]).forEach((k) => {
    const v = c[k];
    if (v === null) return;
    if (v >= 85) strengths.push(names[k]);
    else if (v < 65) improvements.push(names[k]);
  });
  return { strengths, improvements };
}
