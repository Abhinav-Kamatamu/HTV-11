import { THRESHOLDS } from "./sources";
import { DAY_MS } from "./types";

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

// ---- FIB-4 (Sterling 2006; bands from AASLD 2023) -------------------------------------------

/** age × AST / (platelets × √ALT). AST and ALT in U/L, platelets in 10^9/L. */
export function fib4(i: { age: number; ast: number; alt: number; platelets: number }): number {
  return (i.age * i.ast) / (i.platelets * Math.sqrt(i.alt));
}

export type Fib4Band = "low" | "intermediate" | "high";

export function fib4Band(value: number, age: number): Fib4Band {
  const t = THRESHOLDS.fib4;
  const lowCut = age >= t.age65Plus ? t.lowAge65Plus : t.low;
  if (value < lowCut) return "low";
  if (value > t.high) return "high";
  return "intermediate";
}

// ---- Fatty Liver Index (Bedogni 2006) -------------------------------------------------------

/** Percent, 0 to 100. Triglycerides in mmol/L (converted to mg/dL for the published formula). */
export function fli(i: { triglyceridesMmolL: number; bmi: number; ggt: number; waistCm: number }): number {
  const tgMgDl = i.triglyceridesMmolL * THRESHOLDS.fli.triglyceridesMmolToMgDl;
  const l = 0.953 * Math.log(tgMgDl) + 0.139 * i.bmi + 0.718 * Math.log(i.ggt) + 0.053 * i.waistCm - 15.745;
  return (100 * Math.exp(l)) / (1 + Math.exp(l));
}

export type FliBand = "rule_out" | "indeterminate" | "rule_in";

export function fliBand(value: number): FliBand {
  if (value < THRESHOLDS.fli.ruleOutBelow) return "rule_out";
  return value >= THRESHOLDS.fli.ruleInFrom ? "rule_in" : "indeterminate";
}

// ---- CANRISK (PHAC / CTFPHC) ----------------------------------------------------------------

export type CanriskBand = "low" | "moderate" | "high" | "very_high";

export function canriskBand(score: number): CanriskBand {
  const t = THRESHOLDS.canrisk;
  if (!Number.isFinite(score) || score < 0 || score > t.max) throw new RangeError(`CANRISK score must be 0 to ${t.max}`);
  if (score >= t.veryHighFrom) return "very_high";
  if (score >= t.highFrom) return "high";
  return score >= t.moderateFrom ? "moderate" : "low";
}

// ---- Home blood pressure (Hypertension Canada 2025) -----------------------------------------

export type BpReading = { ts: number; systolic: number; diastolic: number };
export type BpAverage = { systolic: number; diastolic: number; n: number; days: number };

/**
 * Mean of the readings in the `windowDays` before `now`. Returns null unless they cover at least
 * `minDays` distinct days (the guideline asks for a 7 day series).
 */
export function homeBpAverage(
  readings: BpReading[],
  now: number,
  opts: { windowDays?: number; minDays?: number } = {},
): BpAverage | null {
  const windowDays = opts.windowDays ?? 30;
  const minDays = opts.minDays ?? THRESHOLDS.homeBp.minDays;
  const inWindow = readings.filter((r) => r.ts <= now && r.ts > now - windowDays * DAY_MS);
  const days = new Set(inWindow.map((r) => Math.floor(r.ts / DAY_MS))).size;
  if (days < minDays) return null;
  const mean = (f: (r: BpReading) => number) => inWindow.reduce((a, r) => a + f(r), 0) / inWindow.length;
  return { systolic: mean((r) => r.systolic), diastolic: mean((r) => r.diastolic), n: inWindow.length, days };
}

/** High when systolic OR diastolic reaches the threshold. */
export function homeBpHigh(avg: { systolic: number; diastolic: number }): boolean {
  return avg.systolic >= THRESHOLDS.homeBp.systolic || avg.diastolic >= THRESHOLDS.homeBp.diastolic;
}

/** Pairs two daily series by timestamp (the seed and the ingest route write both at the same ts). */
export function pairBp(systolic: { ts: number; value: number }[], diastolic: { ts: number; value: number }[]): BpReading[] {
  const dia = new Map(diastolic.map((d) => [d.ts, d.value]));
  return systolic.flatMap((s) => (dia.has(s.ts) ? [{ ts: s.ts, systolic: s.value, diastolic: dia.get(s.ts)! }] : []));
}

// ---- Kidney staging (KDIGO 2024) ------------------------------------------------------------

export type EgfrCategory = "G1" | "G2" | "G3a" | "G3b" | "G4" | "G5";

export function egfrCategory(egfr: number): EgfrCategory {
  if (egfr >= 90) return "G1";
  if (egfr >= 60) return "G2";
  if (egfr >= 45) return "G3a";
  if (egfr >= 30) return "G3b";
  return egfr >= 15 ? "G4" : "G5";
}

export type AcrCategory = "A1" | "A2" | "A3";

/** ACR in mg/mmol. A2 is 3 to 30 inclusive. */
export function acrCategory(acr: number): AcrCategory {
  const t = THRESHOLDS.ckd;
  if (acr > t.acrA3From) return "A3";
  return acr >= t.acrA2From ? "A2" : "A1";
}
