import { DAY_MS, DAYS_PER_YEAR, dayOf, type Pt } from "./types";

// Lab trends (RISK_ENGINE §3a): Mann-Kendall for "is there a trend" and Sen's slope for "how fast".
// Labs are 4 to 10 irregular points, where one outlier swings OLS and R² means little.

export const LAB_GATE = { minPoints: 4, alpha: 0.10, horizonYears: 3, ciZ: 1.645 } as const;
const EXACT_MAX_N = 10; // exact distribution for n <= 10 without ties
const EXACT_TIES_MAX_N = 8; // enumerate arrangements when there are ties and n is small enough

const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

export type LabTrend = {
  /** Points after collapsing same-day duplicates to their mean. */
  n: number;
  /** Mann-Kendall S: concordant minus discordant pairs. */
  s: number;
  /** Two-sided p-value. */
  p: number;
  exact: boolean;
  /** Sen's slope, units per year, with a 90% interval. */
  slopePerYear: number;
  slopeLowPerYear: number;
  slopeHighPerYear: number;
  /** Sen line value at the first point's time; the line is intercept + slope × years since firstTs. */
  intercept: number;
  interceptLow: number;
  interceptHigh: number;
  firstTs: number;
  lastTs: number;
  direction: "up" | "down" | "flat";
  /** n >= 4 and p < 0.10. Three points can be drawn but never earn points. */
  passes: boolean;
};

/** Same-day readings (one draw split across tubes, a repeat) become one mean point. */
export function collapseSameDay(points: Pt[]): Pt[] {
  const groups = new Map<number, Pt[]>();
  for (const p of [...points].sort((a, b) => a.ts - b.ts)) {
    const d = dayOf(p.ts);
    groups.set(d, [...(groups.get(d) ?? []), p]);
  }
  return [...groups.values()].map((g) => ({
    ts: g.reduce((a, p) => a + p.ts, 0) / g.length,
    value: g.reduce((a, p) => a + p.value, 0) / g.length,
  }));
}

function mannKendallS(y: number[]): number {
  let s = 0;
  for (let i = 0; i < y.length; i++) for (let j = i + 1; j < y.length; j++) s += sign(y[j] - y[i]);
  return s;
}

function tieGroups(y: number[]): number[] {
  const counts = new Map<number, number>();
  for (const v of y) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.values()].filter((c) => c > 1);
}

/** Var(S) with the tie correction. */
function varianceS(n: number, ties: number[]): number {
  let v = n * (n - 1) * (2 * n + 5);
  for (const t of ties) v -= t * (t - 1) * (2 * t + 5);
  return v / 18;
}

/** Number of permutations of n items with k inversions, k = 0..n(n-1)/2 (Mahonian numbers). */
function inversionCounts(n: number): number[] {
  let counts = [1];
  for (let m = 2; m <= n; m++) {
    const next = new Array<number>(counts.length + m - 1).fill(0);
    for (let k = 0; k < counts.length; k++) for (let add = 0; add < m; add++) next[k + add] += counts[k];
    counts = next;
  }
  return counts;
}

/** Exact two-sided p for n distinct values: S = n(n-1)/2 − 2 × inversions. */
function exactPNoTies(n: number, s: number): number {
  const counts = inversionCounts(n);
  const max = (n * (n - 1)) / 2;
  let extreme = 0;
  let total = 0;
  counts.forEach((c, inversions) => {
    total += c;
    if (Math.abs(max - 2 * inversions) >= Math.abs(s)) extreme += c;
  });
  return extreme / total;
}

/** Exact permutation p with ties: every arrangement of the observed values over the time order. */
function exactPWithTies(y: number[], s: number): number {
  const n = y.length;
  const a = [...y];
  let extreme = 0;
  let total = 0;
  const visit = () => {
    total++;
    if (Math.abs(mannKendallS(a)) >= Math.abs(s)) extreme++;
  };
  // Heap's algorithm
  const c = new Array<number>(n).fill(0);
  visit();
  let i = 1;
  while (i < n) {
    if (c[i] < i) {
      const k = i % 2 === 0 ? 0 : c[i];
      [a[k], a[i]] = [a[i], a[k]];
      visit();
      c[i]++;
      i = 1;
    } else {
      c[i] = 0;
      i++;
    }
  }
  return extreme / total;
}

/** Abramowitz and Stegun 7.1.26, absolute error below 1.5e-7. */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const r = 1 - poly * Math.exp(-x * x);
  return x >= 0 ? r : -r;
}
const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

function normalP(n: number, s: number, ties: number[]): number {
  const v = varianceS(n, ties);
  if (v <= 0) return 1;
  const z = s === 0 ? 0 : (s - sign(s)) / Math.sqrt(v); // continuity correction
  return Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
}

const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length;
  return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
};

/** Value at 1-based fractional rank r of a sorted array, clamped to the ends. */
function atRank(sorted: number[], r: number): number {
  const clamped = Math.min(sorted.length, Math.max(1, r));
  const lo = Math.floor(clamped);
  const hi = Math.ceil(clamped);
  return sorted[lo - 1] + (sorted[hi - 1] - sorted[lo - 1]) * (clamped - lo);
}

const interceptFor = (slope: number, years: number[], y: number[]) => median(y.map((v, i) => v - slope * years[i]));

/** Null with fewer than 2 distinct days. */
export function labTrend(points: Pt[]): LabTrend | null {
  const pts = collapseSameDay(points);
  const n = pts.length;
  if (n < 2) return null;
  const y = pts.map((p) => p.value);
  const years = pts.map((p) => (p.ts - pts[0].ts) / (DAY_MS * DAYS_PER_YEAR));
  const s = mannKendallS(y);
  const ties = tieGroups(y);

  let p: number;
  let exact = true;
  if (ties.length === 0 && n <= EXACT_MAX_N) p = exactPNoTies(n, s);
  else if (ties.length > 0 && n <= EXACT_TIES_MAX_N) p = exactPWithTies(y, s);
  else {
    exact = false;
    p = normalP(n, s, ties);
  }

  const slopes: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) slopes.push((y[j] - y[i]) / (years[j] - years[i]));
  slopes.sort((a, b) => a - b);
  const slope = median(slopes);
  const bigN = slopes.length;
  const c = LAB_GATE.ciZ * Math.sqrt(varianceS(n, ties));
  const low = atRank(slopes, (bigN - c) / 2);
  const high = atRank(slopes, (bigN + c) / 2 + 1);

  return {
    n,
    s,
    p,
    exact,
    slopePerYear: slope,
    slopeLowPerYear: low,
    slopeHighPerYear: high,
    intercept: interceptFor(slope, years, y),
    interceptLow: interceptFor(low, years, y),
    interceptHigh: interceptFor(high, years, y),
    firstTs: pts[0].ts,
    lastTs: pts[n - 1].ts,
    direction: slope > 0 ? "up" : slope < 0 ? "down" : "flat",
    passes: n >= LAB_GATE.minPoints && p < LAB_GATE.alpha,
  };
}

/** Value of the Sen line at `ts`. */
export function senValueAt(t: LabTrend, ts: number): number {
  return t.intercept + t.slopePerYear * ((ts - t.firstTs) / (DAY_MS * DAYS_PER_YEAR));
}

export type LabCrossing = {
  /** Days from the last reading to the Sen line reaching the threshold. */
  days: number;
  /** Same with the upper (faster) and lower (slower) slope bounds; slow is null when its slope never gets there. */
  fastDays: number | null;
  slowDays: number | null;
};

function daysTo(threshold: number, atLast: number, slopePerYear: number): number | null {
  if (slopePerYear === 0) return null;
  const years = (threshold - atLast) / slopePerYear;
  return years > 0 ? years * DAYS_PER_YEAR : null;
}

/**
 * Projected crossing of `threshold`, only when the gate passes, the line heads toward the threshold, and it
 * lands inside the 3 year horizon. Null otherwise.
 */
export function labCrossing(t: LabTrend, threshold: number): LabCrossing | null {
  if (!t.passes) return null;
  const yearsLast = (t.lastTs - t.firstTs) / (DAY_MS * DAYS_PER_YEAR);
  const mid = daysTo(threshold, t.intercept + t.slopePerYear * yearsLast, t.slopePerYear);
  if (mid === null || mid > LAB_GATE.horizonYears * DAYS_PER_YEAR) return null;
  // The faster and slower bounds are the two slope ends, whichever side of the median they fall on.
  const lo = daysTo(threshold, t.interceptLow + t.slopeLowPerYear * yearsLast, t.slopeLowPerYear);
  const hi = daysTo(threshold, t.interceptHigh + t.slopeHighPerYear * yearsLast, t.slopeHighPerYear);
  const both = [lo, hi];
  const ends = both.filter((d): d is number => d !== null);
  const fast = ends.length ? Math.min(...ends, mid) : mid;
  const slow = both.includes(null) ? null : Math.max(...ends, mid);
  return { days: mid, fastDays: fast, slowDays: slow };
}

/** Rapid eGFR decline (KDIGO 2012): the Sen slope falls by MORE than 5 mL/min/1.73m² per year. */
export function isRapidEgfrDecline(t: LabTrend, perYear = 5): boolean {
  return t.passes && t.slopePerYear < -perYear;
}
