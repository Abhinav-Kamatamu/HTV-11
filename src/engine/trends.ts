import { DAY_MS, DAYS_PER_YEAR, type Pt } from "./types";

// Vitals trends: ordinary least squares on dense daily series (RISK_ENGINE §3b). The x axis is epoch
// DAYS, exactly as `stats_agg(value, epoch_days)` in the continuous aggregates (docs/DECISIONS.md), so
// the database and this module return the same slope, intercept and R².

export type OlsFit = {
  n: number;
  /** Units per day. */
  slopePerDay: number;
  /** Value of the line at epoch day 0 (what `intercept()` returns in the toolkit). */
  intercept: number;
  r2: number;
  xMean: number;
  yMean: number;
};

const toDays = (ts: number) => ts / DAY_MS;

/** Null with fewer than 2 points or when every point shares one timestamp. */
export function olsFit(points: Pt[]): OlsFit | null {
  const n = points.length;
  if (n < 2) return null;
  const xMean = points.reduce((a, p) => a + toDays(p.ts), 0) / n;
  const yMean = points.reduce((a, p) => a + p.value, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = toDays(p.ts) - xMean;
    const dy = p.value - yMean;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slopePerDay = sxy / sxx;
  // Same definition as determination_coeff(): 1 for a perfect line, and 1 when y does not vary.
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { n, slopePerDay, intercept: yMean - slopePerDay * xMean, r2, xMean, yMean };
}

export const slopePerYear = (fit: OlsFit): number => fit.slopePerDay * DAYS_PER_YEAR;

export function fitAt(fit: OlsFit, ts: number): number {
  return fit.yMean + fit.slopePerDay * (toDays(ts) - fit.xMean);
}

/**
 * Days from `fromTs` until the fitted line reaches `threshold`. Null when the line is flat, is moving away
 * from the threshold, or has already passed it at `fromTs`.
 */
export function crossingDays(fit: OlsFit, threshold: number, fromTs: number): number | null {
  if (fit.slopePerDay === 0) return null;
  const days = (threshold - fitAt(fit, fromTs)) / fit.slopePerDay;
  return days > 0 ? days : null;
}

export const VITALS_GATE = { minPoints: 14, minR2: 0.5, horizonDays: 3 * DAYS_PER_YEAR } as const;

export type VitalsTrend = {
  fit: OlsFit;
  slopePerYear: number;
  /** n >= 14, R² >= 0.5 and the line heads toward the threshold. */
  passes: boolean;
  /** Days to the threshold, only when `passes` and the crossing is inside the 3 year horizon. */
  crossingDays: number | null;
};

/** Null when there are too few points to fit at all; otherwise the fit with the gate applied. */
export function vitalsTrend(points: Pt[], threshold: number): VitalsTrend | null {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const fit = olsFit(sorted);
  if (!fit) return null;
  const last = sorted[sorted.length - 1].ts;
  const toward = crossingDays(fit, threshold, last);
  const passes = fit.n >= VITALS_GATE.minPoints && fit.r2 >= VITALS_GATE.minR2 && toward !== null;
  return {
    fit,
    slopePerYear: slopePerYear(fit),
    passes,
    crossingDays: passes && toward !== null && toward <= VITALS_GATE.horizonDays ? toward : null,
  };
}

export type BaselineDeviation = { z: number; recentMean: number; baselineMean: number; baselineSd: number };

/**
 * z-score of the last 7 day mean against the patient's own prior 60 days (days 8 to 67 before `now`):
 * (recent mean − baseline mean) / baseline SD. Needs 4+ recent and 20+ baseline readings and a baseline
 * that varies, otherwise null.
 */
export function baselineZScore(points: Pt[], now: number): BaselineDeviation | null {
  const recent = points.filter((p) => p.ts <= now && p.ts > now - 7 * DAY_MS).map((p) => p.value);
  const base = points.filter((p) => p.ts <= now - 7 * DAY_MS && p.ts > now - 67 * DAY_MS).map((p) => p.value);
  if (recent.length < 4 || base.length < 20) return null;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const baselineMean = mean(base);
  const baselineSd = Math.sqrt(base.reduce((a, v) => a + (v - baselineMean) ** 2, 0) / (base.length - 1));
  if (baselineSd < 1e-9) return null;
  const recentMean = mean(recent);
  return { z: (recentMean - baselineMean) / baselineSd, recentMean, baselineMean, baselineSd };
}
