import { describe, expect, it } from "vitest";
import { generateSeed } from "../db/seed/generate";
import { STORY_IDS } from "../db/seed/ids";
import { baselineZScore, crossingDays, fitAt, olsFit, percentileRank, slopePerYear, vitalsTrend } from "./trends";
import { DAY_MS, type Pt } from "./types";

const t0 = Date.UTC(2026, 6, 1);
const line = (n: number, slopePerDay: number, start: number, noise: (i: number) => number = () => 0): Pt[] =>
  Array.from({ length: n }, (_, i) => ({ ts: t0 + i * DAY_MS, value: start + slopePerDay * i + noise(i) }));

describe("olsFit", () => {
  it("recovers an exact line in epoch days, with R² = 1", () => {
    const fit = olsFit(line(30, 0.5, 100))!;
    expect(fit.slopePerDay).toBeCloseTo(0.5, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
    expect(fitAt(fit, t0)).toBeCloseTo(100, 8);
    // intercept is the value at epoch day 0
    expect(fit.intercept).toBeCloseTo(100 - 0.5 * (t0 / DAY_MS), 4);
    expect(slopePerYear(fit)).toBeCloseTo(0.5 * 365.25, 8);
  });

  it("matches a plain sums-of-squares OLS on noisy data", () => {
    const noise = (i: number) => Math.sin(i * 12.9898) * 3;
    const pts = line(40, -0.2, 140, noise);
    const fit = olsFit(pts)!;
    const xs = pts.map((p) => p.ts / DAY_MS - t0 / DAY_MS);
    const ys = pts.map((p) => p.value);
    const n = xs.length;
    const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0), sxx = xs.reduce((a, x) => a + x * x, 0);
    const syy = ys.reduce((a, y) => a + y * y, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    expect(fit.slopePerDay).toBeCloseTo(slope, 9);
    expect(fit.r2).toBeCloseTo(r * r, 9);
    expect(fit.r2).toBeLessThan(1);
  });

  it("needs two distinct timestamps", () => {
    expect(olsFit([])).toBeNull();
    expect(olsFit([{ ts: t0, value: 1 }])).toBeNull();
    expect(olsFit([{ ts: t0, value: 1 }, { ts: t0, value: 2 }])).toBeNull();
  });

  it("reports R² = 1 for a flat series", () => {
    expect(olsFit(line(10, 0, 5))!.r2).toBe(1);
  });
});

describe("crossingDays", () => {
  const fit = olsFit(line(30, 0.5, 100))!; // 114.5 at the last point, rising 0.5/day
  const last = t0 + 29 * DAY_MS;

  it("counts days from the last point to the threshold", () => {
    expect(crossingDays(fit, 130, last)).toBeCloseTo((130 - 114.5) / 0.5, 8);
  });

  it("is null when moving away, already past, or flat", () => {
    expect(crossingDays(fit, 100, last)).toBeNull();
    expect(crossingDays(fit, 114, last)).toBeNull();
    expect(crossingDays(olsFit(line(10, 0, 5))!, 9, last)).toBeNull();
  });
});

describe("vitalsTrend gate", () => {
  const noisy = (i: number) => Math.sin(i * 7.31) * 1.5;

  it("passes with 14+ points, R² >= 0.5 and a crossing inside 3 years", () => {
    const t = vitalsTrend(line(30, 0.5, 100, noisy), 130)!;
    expect(t.passes).toBe(true);
    expect(t.crossingDays).not.toBeNull();
    expect(t.crossingDays!).toBeLessThan(3 * 365.25);
  });

  it("fails below 14 points", () => {
    expect(vitalsTrend(line(13, 0.5, 100), 130)!.passes).toBe(false);
    expect(vitalsTrend(line(14, 0.5, 100), 130)!.passes).toBe(true);
  });

  it("fails when R² is below 0.5", () => {
    const t = vitalsTrend(line(40, 0.01, 100, (i) => Math.sin(i * 3.7) * 10), 130)!;
    expect(t.fit.r2).toBeLessThan(0.5);
    expect(t.passes).toBe(false);
    expect(t.crossingDays).toBeNull();
  });

  it("passes but hides the crossing when it is beyond 3 years", () => {
    const t = vitalsTrend(line(30, 0.01, 100), 130)!;
    expect(t.passes).toBe(true);
    expect(t.crossingDays).toBeNull();
  });

  it("does not pass when moving away from the threshold", () => {
    expect(vitalsTrend(line(30, -0.5, 100), 130)!.passes).toBe(false);
  });
});

describe("baselineZScore", () => {
  const now = t0 + 70 * DAY_MS;
  const series = (recentShift: number): Pt[] =>
    Array.from({ length: 70 }, (_, i) => ({
      ts: t0 + (i + 1) * DAY_MS,
      value: 120 + Math.sin(i * 1.7) * 3 + (i >= 63 ? recentShift : 0),
    }));

  it("is near zero without a shift and large with one", () => {
    expect(Math.abs(baselineZScore(series(0), now)!.z)).toBeLessThan(1);
    expect(baselineZScore(series(10), now)!.z).toBeGreaterThan(3);
  });

  it("returns null without enough data or a varying baseline", () => {
    expect(baselineZScore(series(0).slice(55), now)).toBeNull();
    const flat = series(0).map((p) => ({ ...p, value: 120 }));
    expect(baselineZScore(flat, now)).toBeNull();
  });
});

describe("percentileRank", () => {
  it("is 0 for the smallest value and close to 1 for the largest", () => {
    const pop = [1, 2, 3, 4, 5];
    expect(percentileRank(pop, 1)).toBe(0);
    expect(percentileRank(pop, 5)).toBe(0.8);
  });

  it("counts strictly-below, so a mid-pack value reflects how many it beats", () => {
    expect(percentileRank([10, 20, 30, 40], 25)).toBe(0.5);
  });

  it("is null for an empty population, not a divide-by-zero NaN", () => {
    expect(percentileRank([], 5)).toBeNull();
  });
});

describe("on the seed", () => {
  const data = generateSeed(new Date("2026-10-17T00:00:00Z"));
  const pts = (id: string, metric: string): Pt[] =>
    data.observations.filter((o) => o.patientId === id && o.metric === metric).map((o) => ({ ts: +o.ts, value: o.value }));

  it("Patient B's systolic shows the step as a positive slope (the 60 day baseline already contains part of it, which is why CUSUM exists)", () => {
    const sys = pts(STORY_IDS.B, "bp_systolic");
    const fit = olsFit(sys)!;
    expect(slopePerYear(fit)).toBeGreaterThan(50);
    const z = baselineZScore(sys, Date.parse("2026-10-17T00:00:00Z"))!;
    expect(z.z).toBeGreaterThan(0);
  });

  it("Patient A's weight creeps up and passes the gate toward 90 kg", () => {
    const t = vitalsTrend(pts(STORY_IDS.A, "weight_kg"), 90)!;
    expect(t.passes).toBe(true);
  });
});
