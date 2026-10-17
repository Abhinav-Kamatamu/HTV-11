import { describe, expect, it } from "vitest";
import { generateSeed } from "../db/seed/generate";
import { SILENT_ID, STORY_IDS } from "../db/seed/ids";
import { Rng } from "../db/seed/rng";
import { detectChangePoints } from "./changepoint";
import { DAY_MS, type Pt } from "./types";

const t0 = Date.UTC(2026, 6, 19);
/** Seeded iid normal noise, so the same series every run. */
const daily = (n: number, level: (i: number) => number, sdNoise = 5, skip: (i: number) => boolean = () => false, seed = 7): Pt[] => {
  const rng = new Rng(seed);
  return Array.from({ length: n }, (_, i) => ({ ts: t0 + i * DAY_MS + 7.5 * 3_600_000, value: level(i) + sdNoise * rng.normal(0, 1) })).filter((_, i) => !skip(i));
};
const dayIndex = (ts: number) => Math.round((ts - t0) / DAY_MS);

describe("detectChangePoints", () => {
  it("does not alarm on a steady noisy series (most seeds; the gate removes the rest)", () => {
    let alarms = 0;
    for (let seed = 1; seed <= 40; seed++) alarms += detectChangePoints(daily(90, () => 126, 5, () => false, seed)).length;
    expect(alarms).toBe(0);
    expect(detectChangePoints(daily(90, () => 80, 3))).toEqual([]);
  });

  it("finds an upward step, dates it, and sizes it", () => {
    const [cp, ...rest] = detectChangePoints(daily(90, (i) => (i < 48 ? 126 : 140)));
    expect(rest).toHaveLength(0);
    expect(cp.direction).toBe("up");
    expect(Math.abs(dayIndex(cp.changeTs) - 47)).toBeLessThanOrEqual(2);
    expect(dayIndex(cp.alarmTs)).toBeGreaterThan(47);
    expect(dayIndex(cp.alarmTs) - 47).toBeLessThanOrEqual(6);
    expect(cp.shift).toBeGreaterThan(11);
    expect(cp.shift).toBeLessThan(17);
    expect(cp.shiftSd).toBeGreaterThan(2);
    expect(cp.referenceMean).toBeCloseTo(126, -1);
  });

  it("finds a downward step", () => {
    const [cp] = detectChangePoints(daily(90, (i) => (i < 50 ? 80 : 70), 3));
    expect(cp.direction).toBe("down");
    expect(cp.shift).toBeLessThan(-7);
  });

  it("skips missing days instead of zero filling them", () => {
    const skipEvery3rd = (i: number) => i % 3 === 1;
    const errors: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const cps = detectChangePoints(daily(90, (i) => (i < 48 ? 126 : 140), 5, skipEvery3rd, seed));
      expect(cps.length, `seed ${seed}`).toBe(1);
      expect(cps[0].direction).toBe("up");
      errors.push(Math.abs(dayIndex(cps[0].changeTs) - 47));
    }
    errors.sort((a, b) => a - b);
    expect(errors[10]).toBeLessThanOrEqual(3); // median dating error, days
  });

  it("floors the reference SD so a flat series ignores a tiny wiggle but still catches a real jump", () => {
    const flat = (jump: number) => daily(70, (i) => (i < 40 ? 100 : 100 + jump), 0);
    expect(detectChangePoints(flat(1))).toEqual([]);
    expect(detectChangePoints(flat(10))).toHaveLength(1);
  });

  it("re-baselines after an alarm and finds a second shift on its own", () => {
    const cps = detectChangePoints(daily(150, (i) => (i < 40 ? 126 : i < 100 ? 140 : 126)));
    expect(cps.map((c) => c.direction)).toEqual(["up", "down"]);
    expect(cps[0].shift).toBeGreaterThan(10);
    expect(cps[1].shift).toBeLessThan(-10);
    expect(Math.abs(dayIndex(cps[1].changeTs) - 99)).toBeLessThanOrEqual(3);
  });

  it("needs a reference period", () => {
    expect(detectChangePoints(daily(10, () => 126))).toEqual([]);
    expect(detectChangePoints([])).toEqual([]);
  });

  it("is tunable: h and the practical significance gate", () => {
    const series = daily(90, (i) => (i < 48 ? 126 : 134));
    expect(detectChangePoints(series, { minShiftSd: 1 }).length).toBeGreaterThanOrEqual(1);
    const early = detectChangePoints(series)[0];
    const late = detectChangePoints(series, { h: 12 })[0];
    expect(late.alarmTs).toBeGreaterThan(early.alarmTs);
    expect(detectChangePoints(series, { minShiftSd: 6 })).toEqual([]);
  });

  it("ignores a small persistent drift that would alarm plain CUSUM (shift under 1.5 SD)", () => {
    const small = daily(90, (i) => (i < 40 ? 126 : 129));
    expect(detectChangePoints(small, { minShiftSd: 0 }).length).toBeGreaterThanOrEqual(1);
    expect(detectChangePoints(small)).toEqual([]);
  });
});

describe("on the seed", () => {
  const anchor = new Date("2026-10-17T00:00:00Z");
  const data = generateSeed(anchor);
  const series = (id: string, metric: string): Pt[] =>
    data.observations.filter((o) => o.patientId === id && o.metric === metric).map((o) => ({ ts: +o.ts, value: o.value }));
  const daysAgo = (ts: number) => (+anchor - ts) / DAY_MS;

  it("Patient B's home systolic shifts up about six weeks ago", () => {
    const cps = detectChangePoints(series(STORY_IDS.B, "bp_systolic"));
    expect(cps).toHaveLength(1);
    expect(cps[0].direction).toBe("up");
    expect(daysAgo(cps[0].changeTs)).toBeGreaterThan(38);
    expect(daysAgo(cps[0].changeTs)).toBeLessThan(47);
    expect(cps[0].shift).toBeGreaterThan(10);
    expect(cps[0].shift).toBeLessThan(18);
  });

  it("Patient B's diastolic shifts too, in the same window", () => {
    const [cp] = detectChangePoints(series(STORY_IDS.B, "bp_diastolic"));
    expect(cp.direction).toBe("up");
    expect(daysAgo(cp.changeTs)).toBeGreaterThan(36);
    expect(daysAgo(cp.changeTs)).toBeLessThan(49);
  });

  it("Patient C and the controls have no home BP change-point", () => {
    // The urgent case and the silent patient have a systolic that ramps on purpose; they are allowed to alarm.
    const ids = data.patients.filter((p) => ![STORY_IDS.B, STORY_IDS.URGENT, SILENT_ID].includes(p.id as never)).map((p) => p.id!);
    const alarming = ids.filter((id) => ["bp_systolic", "bp_diastolic"].some((m) => detectChangePoints(series(id, m)).length > 0));
    expect(alarming).toEqual([]);
  });
});
