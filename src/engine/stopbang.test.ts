import { describe, expect, it } from "vitest";
import { evaluateStopBang, stopBangBand, type StopBangInput } from "./stopbang";
import { DAY_MS, DAYS_PER_YEAR } from "./types";

const now = Date.UTC(2026, 9, 17);
const daysAgo = (d: number) => now - d * DAY_MS;
const yearsAgo = (y: number) => now - y * DAYS_PER_YEAR * DAY_MS;

const base: StopBangInput = {
  sex: "female",
  dobMs: yearsAgo(40), // age item false
  now,
  weight: [],
  heightCm: null,
  neckCm: [],
  onTreatment: false,
  homeBp: null,
  checkins: [],
};

describe("evaluateStopBang", () => {
  it("with no data: snoring/tired/apnea/BMI/neck unknown, pressure/age/male known and 0, lower bound", () => {
    const r = evaluateStopBang(base);
    expect(r.items.snoring).toEqual({ value: 0, known: false });
    expect(r.items.tired).toEqual({ value: 0, known: false });
    expect(r.items.observedApnea).toEqual({ value: 0, known: false });
    expect(r.items.bmi).toEqual({ value: 0, known: false });
    expect(r.items.neck).toEqual({ value: 0, known: false });
    expect(r.items.pressure).toEqual({ value: 0, known: true });
    expect(r.items.age).toEqual({ value: 0, known: true });
    expect(r.items.male).toEqual({ value: 0, known: true });
    expect(r.score).toBe(0);
    expect(r.lowerBound).toBe(true);
    expect(r.band).toBe("low");
  });

  it("sleep check-in: uses the latest within 90 days", () => {
    const r = evaluateStopBang({
      ...base,
      checkins: [
        { ts: daysAgo(5), snoring: 1, tired: 1, observedApnea: 1 },
        { ts: daysAgo(100), snoring: 0, tired: 0, observedApnea: 0 }, // older, stale on its own but irrelevant here
      ],
    });
    expect(r.items.snoring).toEqual({ value: 1, known: true });
    expect(r.items.tired).toEqual({ value: 1, known: true });
    expect(r.items.observedApnea).toEqual({ value: 1, known: true });
  });

  it("sleep check-in: a check-in older than 90 days is unknown, not a negative answer", () => {
    const r = evaluateStopBang({ ...base, checkins: [{ ts: daysAgo(91), snoring: 1, tired: 1, observedApnea: 1 }] });
    expect(r.items.snoring).toEqual({ value: 0, known: false });
    expect(r.lowerBound).toBe(true);
  });

  it("sleep check-in: a future-dated entry is ignored", () => {
    const r = evaluateStopBang({ ...base, checkins: [{ ts: daysAgo(-1), snoring: 1, tired: 1, observedApnea: 1 }] });
    expect(r.items.snoring.known).toBe(false);
  });

  it("sleep check-in: picks the most recent of several fresh entries", () => {
    const r = evaluateStopBang({
      ...base,
      checkins: [
        { ts: daysAgo(30), snoring: 0, tired: 0, observedApnea: 0 },
        { ts: daysAgo(2), snoring: 1, tired: 0, observedApnea: 1 },
      ],
    });
    expect(r.items.snoring.value).toBe(1);
    expect(r.items.tired.value).toBe(0);
    expect(r.items.observedApnea.value).toBe(1);
  });

  it("pressure: on treatment counts even with no home BP data", () => {
    expect(evaluateStopBang({ ...base, onTreatment: true }).items.pressure).toEqual({ value: 1, known: true });
  });

  it("pressure: elevated home BP average counts without treatment", () => {
    const r = evaluateStopBang({ ...base, homeBp: { systolic: 130, diastolic: 70, n: 10, days: 10 } });
    expect(r.items.pressure).toEqual({ value: 1, known: true });
  });

  it("pressure: a normal, untreated home BP average is 0, not unknown", () => {
    const r = evaluateStopBang({ ...base, homeBp: { systolic: 118, diastolic: 76, n: 10, days: 10 } });
    expect(r.items.pressure).toEqual({ value: 0, known: true });
  });

  it("BMI: strictly greater than 35, unknown without both weight and height", () => {
    expect(evaluateStopBang({ ...base, weight: [{ ts: daysAgo(1), value: 100 }], heightCm: null }).items.bmi.known).toBe(false);
    expect(evaluateStopBang({ ...base, weight: [], heightCm: 170 }).items.bmi.known).toBe(false);

    const underCutoff = evaluateStopBang({ ...base, weight: [{ ts: daysAgo(1), value: 113 }], heightCm: 180 }); // bmi ~ 34.9
    expect(underCutoff.items.bmi).toEqual({ value: 0, known: true });

    const overCutoff = evaluateStopBang({ ...base, weight: [{ ts: daysAgo(1), value: 114 }], heightCm: 180 }); // bmi ~ 35.2
    expect(overCutoff.items.bmi).toEqual({ value: 1, known: true });
  });

  it("BMI: uses the latest weight reading", () => {
    const r = evaluateStopBang({
      ...base,
      heightCm: 170,
      weight: [
        { ts: daysAgo(400), value: 105 }, // old, over cutoff
        { ts: daysAgo(5), value: 70 }, // latest, under cutoff
      ],
    });
    expect(r.items.bmi).toEqual({ value: 0, known: true });
  });

  it("age: strictly greater than 50", () => {
    expect(evaluateStopBang({ ...base, dobMs: yearsAgo(49.9) }).items.age).toEqual({ value: 0, known: true });
    expect(evaluateStopBang({ ...base, dobMs: yearsAgo(50.1) }).items.age).toEqual({ value: 1, known: true });
  });

  it("neck: strictly greater than 40 cm, unknown with no reading, latest value used", () => {
    expect(evaluateStopBang(base).items.neck.known).toBe(false);
    expect(evaluateStopBang({ ...base, neckCm: [{ ts: daysAgo(1), value: 40 }] }).items.neck).toEqual({ value: 0, known: true });
    expect(evaluateStopBang({ ...base, neckCm: [{ ts: daysAgo(1), value: 40.1 }] }).items.neck).toEqual({ value: 1, known: true });
  });

  it("male: known from sex alone", () => {
    expect(evaluateStopBang({ ...base, sex: "male" }).items.male).toEqual({ value: 1, known: true });
    expect(evaluateStopBang({ ...base, sex: "female" }).items.male).toEqual({ value: 0, known: true });
  });

  it("bands: 0-2 low, 3-4 intermediate, 5-8 high", () => {
    expect(stopBangBand(0)).toBe("low");
    expect(stopBangBand(2)).toBe("low");
    expect(stopBangBand(3)).toBe("intermediate");
    expect(stopBangBand(4)).toBe("intermediate");
    expect(stopBangBand(5)).toBe("high");
    expect(stopBangBand(8)).toBe("high");
  });

  it("a fully known high score is not flagged as a lower bound", () => {
    const r = evaluateStopBang({
      sex: "male",
      dobMs: yearsAgo(60),
      now,
      weight: [{ ts: daysAgo(1), value: 110 }],
      heightCm: 170,
      neckCm: [{ ts: daysAgo(1), value: 42 }],
      onTreatment: true,
      homeBp: null,
      checkins: [{ ts: daysAgo(1), snoring: 1, tired: 1, observedApnea: 1 }],
    });
    expect(r.score).toBe(8);
    expect(r.lowerBound).toBe(false);
    expect(r.band).toBe("high");
  });

  it("a missing neck reading only lowers the bound, it never flips a high score to low", () => {
    const r = evaluateStopBang({
      ...base,
      sex: "male",
      dobMs: yearsAgo(60),
      onTreatment: true,
      checkins: [{ ts: daysAgo(1), snoring: 1, tired: 1, observedApnea: 1 }],
    });
    expect(r.score).toBe(6); // snoring, tired, apnea, pressure, age, male; BMI and neck unknown
    expect(r.lowerBound).toBe(true);
    expect(r.band).toBe("high");
  });

  it("cites Chung 2016", () => {
    expect(evaluateStopBang(base).sourceIds).toEqual(["stopbang_chung_2016"]);
  });
});
