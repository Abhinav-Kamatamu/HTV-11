import { describe, expect, it } from "vitest";
import { ckdEpi2021, generateSeed, UNITS } from "./generate";
import { SEED_ID_PREFIX, STORY_IDS } from "./ids";

const anchor = new Date("2026-10-17T00:00:00Z");
const data = generateSeed(anchor);
const series = (patientId: string, metric: string) =>
  data.observations
    .filter((o) => o.patientId === patientId && o.metric === metric)
    .sort((a, b) => +a.ts - +b.ts);

describe("seed generator", () => {
  it("is deterministic", () => {
    expect(generateSeed(anchor)).toEqual(data);
  });

  it("labels everything synthetic and keeps every row under the seed id prefix", () => {
    expect(data.patients.every((p) => p.synthetic && p.id!.startsWith(SEED_ID_PREFIX))).toBe(true);
    expect(data.observations.every((o) => o.source === "synthetic")).toBe(true);
    for (const rows of [data.meals, data.symptomLogs, data.labReports]) {
      expect(rows.every((r) => r.id!.startsWith(SEED_ID_PREFIX))).toBe(true);
    }
    expect(data.patients.length).toBe(24);
  });

  it("uses the documented unit for every metric and nothing in the future", () => {
    for (const o of data.observations) {
      expect(o.unit).toBe(UNITS[o.metric as keyof typeof UNITS]);
      expect(+o.ts).toBeLessThan(+anchor);
      expect(Number.isFinite(o.value)).toBe(true);
    }
  });

  it("Patient A: at least 6 yearly HbA1c points ending 5.5, 5.7, 5.9, all under 6.0", () => {
    const values = series(STORY_IDS.A, "hba1c").map((o) => o.value);
    expect(values.length).toBeGreaterThanOrEqual(6);
    expect(values.slice(-3)).toEqual([5.5, 5.7, 5.9]);
    expect(Math.max(...values)).toBeLessThan(6.0);
  });

  it("Patient A: thirst/fatigue symptom logs, 9 inside 6 weeks", () => {
    const logs = data.symptomLogs.filter((l) => l.patientId === STORY_IDS.A);
    expect(logs).toHaveLength(9);
    expect(logs.every((l) => +anchor - +l.ts <= 42 * 86_400_000)).toBe(true);
  });

  it("Patient B: eGFR falls about 6/yr and is still above 60; ACR reaches A2; home BP near 141/88", () => {
    const egfr = series(STORY_IDS.B, "egfr").map((o) => o.value);
    expect(egfr.length).toBeGreaterThanOrEqual(4);
    const perYear = (egfr[0] - egfr[egfr.length - 1]) / (egfr.length - 1);
    expect(perYear).toBeGreaterThan(5);
    expect(perYear).toBeLessThan(7);
    expect(Math.min(...egfr)).toBeGreaterThan(60);
    expect(series(STORY_IDS.B, "acr").at(-1)!.value).toBeGreaterThanOrEqual(3);
    const mean = (m: string) => {
      const v = series(STORY_IDS.B, m).map((o) => o.value);
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    expect(mean("bp_systolic")).toBeGreaterThan(138);
    expect(mean("bp_systolic")).toBeLessThan(144);
    expect(mean("bp_diastolic")).toBeGreaterThan(85);
  });

  it("Patient C: ALT/GGT/TG climb while FIB-4 stays low", () => {
    for (const m of ["alt", "ggt", "triglycerides"]) {
      const v = series(STORY_IDS.C, m).map((o) => o.value);
      expect(v.at(-1)!).toBeGreaterThan(v[0]);
    }
    const last = (m: string) => series(STORY_IDS.C, m).at(-1)!.value;
    const dob = new Date(data.patients.find((p) => p.id === STORY_IDS.C)!.dob);
    const age = (+anchor - +dob) / (365.25 * 86_400_000);
    const fib4 = (age * last("ast")) / (last("platelets") * Math.sqrt(last("alt")));
    expect(fib4).toBeLessThan(1.3);
  });

  it("urgent case has a red-flag symptom log", () => {
    expect(data.symptomLogs.some((l) => l.patientId === STORY_IDS.URGENT && l.redFlag)).toBe(true);
  });

  it("derived eGFR matches CKD-EPI 2021 for the stored creatinine", () => {
    const [cr] = series(STORY_IDS.B, "creatinine");
    const [eg] = series(STORY_IDS.B, "egfr");
    expect(Math.abs(ckdEpi2021(cr.value, 57, "male") - eg.value)).toBeLessThan(3);
  });
});
