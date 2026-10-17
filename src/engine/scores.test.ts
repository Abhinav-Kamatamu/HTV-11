import { describe, expect, it } from "vitest";
import {
  acrCategory, bmi, canriskBand, egfrCategory, fib4, fib4Band, fli, fliBand, homeBpAverage, homeBpHigh, pairBp,
} from "./scores";
import { DAY_MS } from "./types";

describe("bmi", () => {
  it("weight / height squared", () => {
    expect(bmi(80, 200)).toBeCloseTo(20, 10);
    expect(bmi(79, 165)).toBeCloseTo(29.02, 2);
  });
});

describe("FIB-4", () => {
  it("matches hand calculations", () => {
    expect(fib4({ age: 50, ast: 40, alt: 100, platelets: 200 })).toBeCloseTo(1.0, 10);
    expect(fib4({ age: 47, ast: 31, alt: 52, platelets: 243 })).toBeCloseTo(0.83148, 4);
  });

  it("bands: < 1.3 low, 1.3 to 2.67 intermediate, > 2.67 high", () => {
    expect(fib4Band(1.29, 50)).toBe("low");
    expect(fib4Band(1.3, 50)).toBe("intermediate");
    expect(fib4Band(2.67, 50)).toBe("intermediate");
    expect(fib4Band(2.68, 50)).toBe("high");
  });

  it("uses the 2.0 lower cutoff from age 65", () => {
    expect(fib4Band(1.8, 64)).toBe("intermediate");
    expect(fib4Band(1.8, 65)).toBe("low");
    expect(fib4Band(2.0, 65)).toBe("intermediate");
  });
});

describe("Fatty Liver Index", () => {
  it("matches the published formula (triglycerides converted from mmol/L)", () => {
    expect(fli({ triglyceridesMmolL: 1.0, bmi: 22, ggt: 15, waistCm: 80 })).toBeCloseTo(9.7127, 3);
    expect(fli({ triglyceridesMmolL: 2.2, bmi: 30.6, ggt: 68, waistCm: 104 })).toBeCloseTo(88.84, 1);
  });

  it("bands at 30 and 60", () => {
    expect(fliBand(29.9)).toBe("rule_out");
    expect(fliBand(30)).toBe("indeterminate");
    expect(fliBand(59.9)).toBe("indeterminate");
    expect(fliBand(60)).toBe("rule_in");
  });
});

describe("CANRISK", () => {
  it("bands at 21, 33 and 43", () => {
    expect(canriskBand(0)).toBe("low");
    expect(canriskBand(20)).toBe("low");
    expect(canriskBand(21)).toBe("moderate");
    expect(canriskBand(32)).toBe("moderate");
    expect(canriskBand(33)).toBe("high");
    expect(canriskBand(42)).toBe("high");
    expect(canriskBand(43)).toBe("very_high");
    expect(canriskBand(87)).toBe("very_high");
  });

  it("rejects scores outside 0 to 87", () => {
    expect(() => canriskBand(-1)).toThrow(RangeError);
    expect(() => canriskBand(88)).toThrow(RangeError);
    expect(() => canriskBand(Number.NaN)).toThrow(RangeError);
  });
});

describe("home BP", () => {
  const now = Date.UTC(2026, 9, 17);
  const reading = (daysAgo: number, s: number, d: number) => ({ ts: now - daysAgo * DAY_MS + 7 * 3_600_000, systolic: s, diastolic: d });

  it("averages the window and needs 7 distinct days", () => {
    const week = [1, 2, 3, 4, 5, 6, 7].map((d) => reading(d, 130 + d, 80));
    const avg = homeBpAverage(week, now)!;
    expect(avg.days).toBe(7);
    expect(avg.systolic).toBeCloseTo(134, 10);
    expect(homeBpAverage(week.slice(0, 6), now)).toBeNull();
  });

  it("ignores readings outside the window and in the future", () => {
    const rows = [...[1, 2, 3, 4, 5, 6, 7].map((d) => reading(d, 120, 70)), reading(45, 180, 100), reading(-1, 190, 110)];
    expect(homeBpAverage(rows, now)!.systolic).toBe(120);
  });

  it("is high when either number reaches 130/80", () => {
    expect(homeBpHigh({ systolic: 129.9, diastolic: 79.9 })).toBe(false);
    expect(homeBpHigh({ systolic: 130, diastolic: 70 })).toBe(true);
    expect(homeBpHigh({ systolic: 120, diastolic: 80 })).toBe(true);
  });

  it("pairs systolic and diastolic by timestamp", () => {
    const pairs = pairBp([{ ts: 1, value: 120 }, { ts: 2, value: 130 }], [{ ts: 2, value: 85 }]);
    expect(pairs).toEqual([{ ts: 2, systolic: 130, diastolic: 85 }]);
  });
});

describe("kidney staging", () => {
  it("eGFR G categories", () => {
    expect(egfrCategory(95)).toBe("G1");
    expect(egfrCategory(73)).toBe("G2");
    expect(egfrCategory(59.9)).toBe("G3a");
    expect(egfrCategory(45)).toBe("G3a");
    expect(egfrCategory(44)).toBe("G3b");
    expect(egfrCategory(29)).toBe("G4");
    expect(egfrCategory(14)).toBe("G5");
  });

  it("ACR A categories in mg/mmol", () => {
    expect(acrCategory(2.9)).toBe("A1");
    expect(acrCategory(3)).toBe("A2");
    expect(acrCategory(30)).toBe("A2");
    expect(acrCategory(30.1)).toBe("A3");
  });
});
