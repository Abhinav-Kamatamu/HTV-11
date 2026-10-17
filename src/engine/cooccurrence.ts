// Metabolic syndrome, 3 of 5 (RISK_ENGINE §4a, Alberti 2009 harmonized definition).
// Each criterion is "met", "not_met" or "unknown" — never "not met" for missing data, so the
// clinician sees what a lab order would settle. For triglycerides, HDL and BP, "met on treatment"
// only turns an existing not-met reading into "met"; it never manufactures "met" out of a
// criterion that was never measured (DECISIONS.md 2026-10-17 05:10/06:00: Patient C's controlled
// home BP needs the override, but their HDL — never drawn — stays unknown despite being on
// treatment for something else). Fasting glucose has no treatment override at all: the synthetic
// `medications` list never carries a glucose-lowering drug, and the team's verified Patient C
// result (3 met, 2 unknown) only holds if FPG stays data-only.

import { THRESHOLDS } from "./sources";
import { DAY_MS, DAYS_PER_YEAR, type Pt, type Sex } from "./types";
import type { BpAverage } from "./scores";

export type CriterionStatus = "met" | "not_met" | "unknown";

export type LabCriterionResult = {
  status: CriterionStatus;
  value: number | null; // the reading used, or null when unknown or met by treatment
  ts: number | null;
  byTreatment: boolean;
};

export type BpCriterionResult = {
  status: CriterionStatus;
  systolic: number | null;
  diastolic: number | null;
  byTreatment: boolean;
};

export type MetsCriteria = {
  waist: LabCriterionResult;
  triglycerides: LabCriterionResult;
  hdl: LabCriterionResult;
  bp: BpCriterionResult;
  fpg: LabCriterionResult;
};

export type MetsResult = {
  criteria: MetsCriteria;
  metCount: number;
  unknownCount: number;
  /** >= THRESHOLDS.mets.minCriteria (3). A count of guideline criteria for clinician review, not a diagnosis. */
  fires: boolean;
  sourceIds: readonly [typeof THRESHOLDS.mets.source, typeof THRESHOLDS.mets.waistCm.source];
};

export type MetsInput = {
  sex: Sex;
  /** Non-empty `intake.medications`. Overrides triglycerides, HDL and BP to "met"; never FPG. */
  onTreatment: boolean;
  now: number;
  waist: Pt[];
  triglycerides: Pt[];
  hdl: Pt[];
  fpg: Pt[];
  /** Precomputed 30-day home BP mean (`homeBpAverage`), or null when there is no qualifying window. */
  homeBp: BpAverage | null;
};

/** Labs and waist use the latest value within 12 months (RISK_ENGINE §4a), not an average. */
const LAB_FRESHNESS_DAYS = DAYS_PER_YEAR;

function latestWithin(pts: Pt[], now: number, windowDays: number): Pt | null {
  let latest: Pt | null = null;
  for (const p of pts) {
    if (p.ts > now || p.ts <= now - windowDays * DAY_MS) continue;
    if (!latest || p.ts > latest.ts) latest = p;
  }
  return latest;
}

/**
 * Treatment only ever turns an existing "not_met" reading into "met" — it never manufactures
 * "met" out of missing data, so a criterion that was simply never measured (e.g. Patient C's HDL)
 * stays "unknown" even though the patient is on treatment for something else. A reading that
 * already meets the cutoff wins on its own (byTreatment: false), keeping the real evidence.
 */
function labCriterion(pts: Pt[], now: number, meets: (value: number) => boolean, treatable: boolean, onTreatment: boolean): LabCriterionResult {
  const latest = latestWithin(pts, now, LAB_FRESHNESS_DAYS);
  if (!latest) return { status: "unknown", value: null, ts: null, byTreatment: false };
  if (meets(latest.value)) return { status: "met", value: latest.value, ts: latest.ts, byTreatment: false };
  if (treatable && onTreatment) return { status: "met", value: latest.value, ts: latest.ts, byTreatment: true };
  return { status: "not_met", value: latest.value, ts: latest.ts, byTreatment: false };
}

function bpCriterion(avg: BpAverage | null, onTreatment: boolean): BpCriterionResult {
  if (!avg) return { status: "unknown", systolic: null, diastolic: null, byTreatment: false };
  const t = THRESHOLDS.mets;
  if (avg.systolic >= t.bpSystolic || avg.diastolic >= t.bpDiastolic) {
    return { status: "met", systolic: avg.systolic, diastolic: avg.diastolic, byTreatment: false };
  }
  if (onTreatment) return { status: "met", systolic: avg.systolic, diastolic: avg.diastolic, byTreatment: true };
  return { status: "not_met", systolic: avg.systolic, diastolic: avg.diastolic, byTreatment: false };
}

export function evaluateMets(input: MetsInput): MetsResult {
  const t = THRESHOLDS.mets;
  const waistCutoff = input.sex === "male" ? t.waistCm.male : t.waistCm.female;
  const hdlCutoff = input.sex === "male" ? t.hdlMmolL.male : t.hdlMmolL.female;

  const criteria: MetsCriteria = {
    waist: labCriterion(input.waist, input.now, (v) => v >= waistCutoff, false, input.onTreatment),
    triglycerides: labCriterion(input.triglycerides, input.now, (v) => v >= t.triglyceridesMmolL, true, input.onTreatment),
    hdl: labCriterion(input.hdl, input.now, (v) => v < hdlCutoff, true, input.onTreatment),
    bp: bpCriterion(input.homeBp, input.onTreatment),
    fpg: labCriterion(input.fpg, input.now, (v) => v >= t.fpgMmolL, false, input.onTreatment),
  };

  const statuses = Object.values(criteria).map((c) => c.status);
  const metCount = statuses.filter((s) => s === "met").length;
  const unknownCount = statuses.filter((s) => s === "unknown").length;

  return {
    criteria,
    metCount,
    unknownCount,
    fires: metCount >= t.minCriteria,
    sourceIds: [t.source, t.waistCm.source],
  };
}
