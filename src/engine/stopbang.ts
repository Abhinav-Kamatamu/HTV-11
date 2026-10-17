// STOP-Bang obstructive sleep apnea screen (RISK_ENGINE §4b, Chung 2016).
// Three items (snoring, tired, observed apnea) come from the weekly sleep check-in, within a
// 90-day freshness window; the other five (pressure, BMI, age, neck, male) are filled from the
// record. A missing item counts 0, so the total is a lower bound, never an overcount
// ("≥ 3, neck not recorded") — "pressure", "age" and "male" are always known, since they are
// derived from a rule rather than a possibly-missing measurement.

import { bmi, homeBpHigh, type BpAverage } from "./scores";
import { THRESHOLDS } from "./sources";
import { DAY_MS, DAYS_PER_YEAR, type Pt, type Sex } from "./types";

const CHECKIN_FRESHNESS_DAYS = 90;

export type StopBangItemKey = "snoring" | "tired" | "observedApnea" | "pressure" | "bmi" | "age" | "neck" | "male";

export type StopBangItem = { value: 0 | 1; known: boolean };

export type StopBangBand = "low" | "intermediate" | "high";

export type SleepCheckin = { ts: number; snoring: 0 | 1; tired: 0 | 1; observedApnea: 0 | 1 };

export type StopBangInput = {
  sex: Sex;
  dobMs: number;
  now: number;
  weight: Pt[]; // kg, latest value used, no freshness gate
  heightCm: number | null; // intake
  neckCm: Pt[]; // cm, asked once at intake but stored as an observation; latest value used
  onTreatment: boolean; // non-empty intake.medications
  homeBp: BpAverage | null; // homeBpAverage() output, passed straight through
  checkins: SleepCheckin[];
};

export type StopBangResult = {
  items: Record<StopBangItemKey, StopBangItem>;
  /** Sum of every item's value, with unknown items counted as 0 — a lower bound. */
  score: number;
  /** True when at least one item is unknown, so `score` may understate the true total. */
  lowerBound: boolean;
  /** Computed from the lower-bound `score`, so it can only understate, never overstate, risk. */
  band: StopBangBand;
  sourceIds: readonly [typeof THRESHOLDS.stopbang.source];
};

function latestValue(pts: Pt[]): number | null {
  let latest: Pt | null = null;
  for (const p of pts) if (!latest || p.ts > latest.ts) latest = p;
  return latest ? latest.value : null;
}

function latestCheckin(checkins: SleepCheckin[], now: number): SleepCheckin | null {
  let latest: SleepCheckin | null = null;
  for (const c of checkins) {
    if (c.ts > now || c.ts <= now - CHECKIN_FRESHNESS_DAYS * DAY_MS) continue;
    if (!latest || c.ts > latest.ts) latest = c;
  }
  return latest;
}

function known(value: 0 | 1): StopBangItem {
  return { value, known: true };
}

const UNKNOWN: StopBangItem = { value: 0, known: false };

export function stopBangBand(score: number): StopBangBand {
  const t = THRESHOLDS.stopbang;
  if (score >= t.highFrom) return "high";
  return score >= t.intermediateFrom ? "intermediate" : "low";
}

export function evaluateStopBang(input: StopBangInput): StopBangResult {
  const t = THRESHOLDS.stopbang;
  const checkin = latestCheckin(input.checkins, input.now);
  const weightKg = latestValue(input.weight);
  const neckCm = latestValue(input.neckCm);
  const ageYears = (input.now - input.dobMs) / (DAYS_PER_YEAR * DAY_MS);
  const treatedBp = input.onTreatment || (input.homeBp !== null && homeBpHigh(input.homeBp));

  const items: Record<StopBangItemKey, StopBangItem> = {
    snoring: checkin ? known(checkin.snoring) : UNKNOWN,
    tired: checkin ? known(checkin.tired) : UNKNOWN,
    observedApnea: checkin ? known(checkin.observedApnea) : UNKNOWN,
    pressure: known(treatedBp ? 1 : 0),
    bmi: weightKg !== null && input.heightCm !== null ? known(bmi(weightKg, input.heightCm) > t.bmiAbove ? 1 : 0) : UNKNOWN,
    age: known(ageYears > t.ageAbove ? 1 : 0),
    neck: neckCm !== null ? known(neckCm > t.neckCmAbove ? 1 : 0) : UNKNOWN,
    male: known(input.sex === "male" ? 1 : 0),
  };

  const values = Object.values(items);
  const score = values.reduce((sum, i) => sum + i.value, 0);
  const lowerBound = values.some((i) => !i.known);

  return { items, score, lowerBound, band: stopBangBand(score), sourceIds: [t.source] };
}
