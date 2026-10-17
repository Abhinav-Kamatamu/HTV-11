import { DAY_MS, dayOf, type Pt } from "./types";

// Tabular CUSUM change-point detection on daily vitals (RISK_ENGINE §3c, Page 1954).
// The slope answers "where is it heading"; this answers "when did it change".

export const CUSUM_DEFAULTS = {
  referenceDays: 28,
  k: 0.5,
  h: 5,
  /** Fewer reference readings than this and the series is not scanned. */
  minReference: 14,
  /** The reference SD never drops below this fraction of the reference mean, so a very steady series cannot alarm on noise. */
  relSigmaFloor: 0.02,
  absSigmaFloor: 0,
  /**
   * Practical significance gate. The reference SD is estimated from ~28 readings, which makes plain CUSUM
   * over-alarm on stable series (on the seed, 20 of 52 home BP series alarmed with shifts under 1.2 SD).
   * An alarm whose shift is smaller than this many reference SDs is treated as noise and scanning continues.
   */
  minShiftSd: 1.5,
} as const;

export type CusumOptions = Partial<{ -readonly [K in keyof typeof CUSUM_DEFAULTS]: number }>;

export type ChangePoint = {
  direction: "up" | "down";
  /**
   * The last day before the shift began. Searched inside the CUSUM run that ended in the alarm (from the last
   * day the sum was 0): the day after which the cumulative deviation rises most steeply, which is the
   * least-squares change point and never earlier than the last zero.
   */
  changeTs: number;
  /** Day the sum crossed h. */
  alarmTs: number;
  /** Mean after the change minus the reference mean, in the series' units. */
  shift: number;
  /** The same shift in reference SDs. */
  shiftSd: number;
  referenceMean: number;
  referenceSd: number;
};

function dailyMeans(points: Pt[]): Pt[] {
  const days = new Map<number, Pt[]>();
  for (const p of [...points].sort((a, b) => a.ts - b.ts)) {
    const d = dayOf(p.ts);
    days.set(d, [...(days.get(d) ?? []), p]);
  }
  return [...days.values()].map((g) => ({
    ts: g[0].ts,
    value: g.reduce((a, p) => a + p.value, 0) / g.length,
  }));
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => {
  const m = mean(a);
  return a.length < 2 ? 0 : Math.sqrt(a.reduce((x, v) => x + (v - m) ** 2, 0) / (a.length - 1));
};

/** Index in [from, to) after which the signed cumulative deviation from the reference is lowest. */
function changeIndex(series: Pt[], from: number, to: number, mu: number, sigma: number, dir: 1 | -1): number {
  let cum = 0;
  let best = from;
  let bestCum = 0;
  for (let j = from + 1; j < to; j++) {
    cum += (dir * (series[j].value - mu)) / sigma;
    if (cum < bestCum) {
      bestCum = cum;
      best = j;
    }
  }
  return best;
}

/**
 * Scans the series for sustained shifts. Missing days are skipped (not zero filled). After an alarm the
 * reference is re-established from the day after the change date, so a second shift is found on its own.
 */
export function detectChangePoints(points: Pt[], options: CusumOptions = {}): ChangePoint[] {
  const o = { ...CUSUM_DEFAULTS, ...options };
  const series = dailyMeans(points);
  const found: ChangePoint[] = [];
  let start = 0;

  while (start < series.length) {
    const refEnd = series[start].ts + o.referenceDays * DAY_MS;
    const reference = series.filter((p, i) => i >= start && p.ts < refEnd);
    if (reference.length < o.minReference) break;
    const mu = mean(reference.map((p) => p.value));
    const sigma = Math.max(sd(reference.map((p) => p.value)), o.relSigmaFloor * Math.abs(mu), o.absSigmaFloor);
    if (sigma === 0) break;

    let hi = 0;
    let lo = 0;
    let runHi = start + reference.length - 1; // index of the last day each sum was 0
    let runLo = runHi;
    let accepted: ChangePoint | null = null;
    let alarmIndex = -1;

    for (let i = start + reference.length; i < series.length && !accepted; i++) {
      const z = (series[i].value - mu) / sigma;
      hi = Math.max(0, hi + z - o.k);
      lo = Math.max(0, lo - z - o.k);
      if (hi === 0) runHi = i;
      if (lo === 0) runLo = i;
      const up = hi > o.h;
      if (!up && !(lo > o.h)) continue;

      // The new level is measured from the alarm day onward (the days between the last zero and the
      // alarm can still be pre-change, which would dilute the estimate).
      const level = series.filter((p, j) => j >= i && p.ts < series[i].ts + o.referenceDays * DAY_MS);
      const shift = mean(level.map((p) => p.value)) - mu;
      if ((up ? shift : -shift) / sigma >= o.minShiftSd) {
        accepted = {
          direction: up ? "up" : "down",
          changeTs: series[changeIndex(series, up ? runHi : runLo, i, mu, sigma, up ? 1 : -1)].ts,
          alarmTs: series[i].ts,
          shift,
          shiftSd: shift / sigma,
          referenceMean: mu,
          referenceSd: sigma,
        };
        alarmIndex = i;
      } else {
        hi = 0; // too small to matter: restart the sums and keep scanning against the same reference
        lo = 0;
        runHi = i;
        runLo = i;
      }
    }
    if (!accepted) break;
    found.push(accepted);
    if (alarmIndex <= start) break;
    start = alarmIndex; // re-baseline on the new regime
  }
  return found;
}
