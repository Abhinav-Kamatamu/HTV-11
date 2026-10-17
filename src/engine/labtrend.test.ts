import { describe, expect, it } from "vitest";
import { collapseSameDay, isRapidEgfrDecline, labCrossing, labTrend, senValueAt } from "./labtrend";
import { DAY_MS, DAYS_PER_YEAR, type Pt } from "./types";

const t0 = Date.UTC(2022, 0, 1);
const yearly = (values: number[], stepDays = DAYS_PER_YEAR): Pt[] =>
  values.map((value, i) => ({ ts: t0 + Math.round(i * stepDays * DAY_MS), value }));
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
const mono = (n: number) => Array.from({ length: n }, (_, i) => 5 + i * 0.1);

describe("Mann-Kendall exact p", () => {
  it("a strictly monotone series gives p = 2/n!", () => {
    for (const n of [3, 4, 5, 6, 8, 10]) {
      const t = labTrend(yearly(mono(n)))!;
      expect(t.exact).toBe(true);
      expect(t.s).toBe((n * (n - 1)) / 2);
      expect(t.p).toBeCloseTo(2 / factorial(n), 12);
    }
  });

  it("known answers: n=3 0.333, n=4 0.083, n=5 0.017", () => {
    expect(labTrend(yearly(mono(3)))!.p).toBeCloseTo(0.3333, 4);
    expect(labTrend(yearly(mono(4)))!.p).toBeCloseTo(0.0833, 4);
    expect(labTrend(yearly(mono(5)))!.p).toBeCloseTo(0.0167, 4);
  });

  it("is symmetric for a falling series", () => {
    const t = labTrend(yearly(mono(5).reverse()))!;
    expect(t.s).toBe(-10);
    expect(t.p).toBeCloseTo(2 / 120, 12);
    expect(t.direction).toBe("down");
  });

  it("agrees with brute-force enumeration for a mixed n=6 series", () => {
    const y = [5.1, 5.0, 5.4, 5.3, 5.6, 5.9];
    const t = labTrend(yearly(y))!;
    const perms = (a: number[]): number[][] => (a.length <= 1 ? [a] : a.flatMap((v, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [v, ...r])));
    const S = (v: number[]) => v.reduce((acc, a, i) => acc + v.slice(i + 1).reduce((x, b) => x + Math.sign(b - a), 0), 0);
    const all = perms([0, 1, 2, 3, 4, 5]);
    const extreme = all.filter((q) => Math.abs(S(q)) >= Math.abs(t.s)).length;
    expect(t.p).toBeCloseTo(extreme / all.length, 12);
  });

  it("uses exact enumeration with ties for small n and the tie-corrected normal for large n", () => {
    const tied = labTrend(yearly([1, 2, 2, 3, 4]))!;
    expect(tied.exact).toBe(true);
    expect(tied.s).toBe(9);
    const long = labTrend(yearly(mono(12)))!;
    expect(long.exact).toBe(false);
    expect(long.p).toBeLessThan(0.001);
    expect(long.p).toBeGreaterThan(2 / factorial(12));
  });

  it("two points or fewer: no trend", () => {
    expect(labTrend(yearly([5]))).toBeNull();
    expect(labTrend(yearly([5, 6]))!.passes).toBe(false);
  });
});

describe("gate", () => {
  it("three points never pass, four monotone points do (p = 0.083 < 0.10)", () => {
    expect(labTrend(yearly(mono(3)))!.passes).toBe(false);
    expect(labTrend(yearly(mono(4)))!.passes).toBe(true);
  });

  it("a noisy flat series does not pass", () => {
    expect(labTrend(yearly([5.4, 5.1, 5.5, 5.2, 5.6, 5.3]))!.passes).toBe(false);
  });
});

describe("Sen's slope", () => {
  it("recovers an exact line per year, with a zero-width interval and its intercept", () => {
    const t = labTrend(yearly([1, 3, 5, 7, 9]))!;
    expect(t.slopePerYear).toBeCloseTo(2, 8);
    expect(t.slopeLowPerYear).toBeCloseTo(2, 8);
    expect(t.slopeHighPerYear).toBeCloseTo(2, 8);
    expect(t.intercept).toBeCloseTo(1, 8);
    expect(senValueAt(t, t0 + 2 * DAYS_PER_YEAR * DAY_MS)).toBeCloseTo(5, 6);
  });

  it("shrugs off one haemolysed outlier where OLS would not", () => {
    const t = labTrend(yearly([5.0, 5.1, 5.2, 9.0, 5.4, 5.5]))!;
    expect(t.slopePerYear).toBeCloseTo(0.1, 1);
  });

  it("interval brackets the estimate for noisy data", () => {
    const t = labTrend(yearly([5.0, 5.3, 5.2, 5.7, 5.6, 6.0]))!;
    expect(t.slopeLowPerYear).toBeLessThanOrEqual(t.slopePerYear);
    expect(t.slopeHighPerYear).toBeGreaterThanOrEqual(t.slopePerYear);
    expect(t.slopeHighPerYear).toBeGreaterThan(t.slopeLowPerYear);
  });

  it("collapses same-day duplicates to their mean first", () => {
    const pts: Pt[] = [...yearly([5.0, 5.2, 5.4, 5.6]), { ts: t0 + 3_600_000, value: 5.2 }];
    expect(collapseSameDay(pts)).toHaveLength(4);
    expect(collapseSameDay(pts)[0].value).toBeCloseTo(5.1, 10);
    expect(labTrend(pts)!.n).toBe(4);
  });
});

describe("projected crossing", () => {
  it("Patient A shape: 4.65 to 5.4 twice-yearly reaches 6.0 in about 2 years", () => {
    const t = labTrend(yearly([4.65, 4.8, 4.95, 5.1, 5.25, 5.4], 182))!;
    expect(t.passes).toBe(true);
    expect(t.p).toBeCloseTo(2 / 720, 10);
    expect(t.slopePerYear).toBeCloseTo(0.3, 1);
    const c = labCrossing(t, 6.0)!;
    expect(c.days / DAYS_PER_YEAR).toBeGreaterThan(1.8);
    expect(c.days / DAYS_PER_YEAR).toBeLessThan(2.2);
    expect(c.fastDays!).toBeLessThanOrEqual(c.days);
    expect(c.slowDays === null || c.slowDays >= c.days).toBe(true);
  });

  it("does not project the 6.5 line (beyond 3 years) or a threshold behind the trend", () => {
    const t = labTrend(yearly([4.65, 4.8, 4.95, 5.1, 5.25, 5.4], 182))!;
    expect(labCrossing(t, 6.5)).toBeNull();
    expect(labCrossing(t, 5.0)).toBeNull();
  });

  it("falling eGFR toward 60 and the rapid-decline rule", () => {
    const t = labTrend(yearly([88, 85, 82, 79, 76, 73], 182))!;
    expect(t.slopePerYear).toBeCloseTo(-6, 0);
    const c = labCrossing(t, 60)!;
    expect(c.days / DAYS_PER_YEAR).toBeGreaterThan(2);
    expect(c.days / DAYS_PER_YEAR).toBeLessThan(2.4);
    expect(isRapidEgfrDecline(t)).toBe(true);
    expect(isRapidEgfrDecline(labTrend(yearly([88, 87.5, 87, 86.5, 86, 85.5], 182))!)).toBe(false);
  });

  it("is never shown when the gate fails", () => {
    expect(labCrossing(labTrend(yearly(mono(3)))!, 6)).toBeNull();
  });
});
