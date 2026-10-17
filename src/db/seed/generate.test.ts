import { describe, expect, it } from "vitest";
import { ckdEpi2021, generateSeed, UNITS } from "./generate";
import { SEED_ID_PREFIX, STORY_IDS } from "./ids";

const anchor = new Date("2026-10-17T00:00:00Z");
const data = generateSeed(anchor);
const gapsInDays = (rows: { ts: Date }[]) => rows.slice(1).map((o, i) => (+o.ts - +rows[i].ts) / 86_400_000);
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

  it("Patient A: six twice-yearly HbA1c points from 4.65 to 5.4, every one below 5.5, projecting to 6.0 in about 2 years", () => {
    const rows = series(STORY_IDS.A, "hba1c");
    const values = rows.map((o) => o.value);
    expect(values).toEqual([4.65, 4.8, 4.95, 5.1, 5.25, 5.4]);
    expect(gapsInDays(rows).every((g) => Math.abs(g - 182) <= 20)).toBe(true);
    const years = (+rows.at(-1)!.ts - +rows[0].ts) / (365.25 * 86_400_000);
    const perYear = (values.at(-1)! - values[0]) / years;
    expect((6.0 - values.at(-1)!) / perYear).toBeGreaterThan(1.7);
    expect((6.0 - values.at(-1)!) / perYear).toBeLessThan(2.3);
  });

  it("story patients A, B, C have six twice-yearly lab draws and every story metric is strictly monotone", () => {
    const story: [string, string[], 1 | -1][] = [
      [STORY_IDS.A, ["hba1c", "fpg", "triglycerides"], 1],
      [STORY_IDS.B, ["acr"], 1],
      [STORY_IDS.B, ["egfr", "creatinine"], -1],
      [STORY_IDS.C, ["alt", "ast", "ggt", "triglycerides"], 1],
      [STORY_IDS.C, ["platelets"], -1],
    ];
    for (const [id, metrics, dir] of story) {
      for (const m of metrics) {
        const rows = series(id, m);
        expect(rows, `${id} ${m}`).toHaveLength(6);
        const v = rows.map((o) => o.value);
        for (let i = 1; i < v.length; i++) expect((v[i] - v[i - 1]) * (m === "creatinine" ? -dir : dir), `${m} step ${i}`).toBeGreaterThan(0);
        expect(gapsInDays(rows).every((g) => Math.abs(g - 182) <= 20), `${m} spacing`).toBe(true);
      }
    }
  });

  it("noise is on controls only: story patients' other labs are flat", () => {
    for (const [id, m] of [[STORY_IDS.A, "alt"], [STORY_IDS.B, "ggt"], [STORY_IDS.C, "hba1c"], [STORY_IDS.A, "hdl"]] as const) {
      expect(new Set(series(id, m).map((o) => o.value)).size, `${id} ${m}`).toBe(1);
    }
    const controlAlt = data.observations.filter((o) => o.metric === "alt" && !Object.values(STORY_IDS).includes(o.patientId as never));
    expect(new Set(controlAlt.map((o) => o.value)).size).toBeGreaterThan(3);
  });

  it("Patient A: thirst/fatigue symptom logs, 9 inside 6 weeks", () => {
    const logs = data.symptomLogs.filter((l) => l.patientId === STORY_IDS.A);
    expect(logs).toHaveLength(9);
    expect(logs.every((l) => +anchor - +l.ts <= 42 * 86_400_000)).toBe(true);
  });

  it("Patient B: eGFR falls about 6/yr and is still above 60; ACR reaches A2; home BP near 141/88", () => {
    const rows = series(STORY_IDS.B, "egfr");
    const egfr = rows.map((o) => o.value);
    const years = (+rows.at(-1)!.ts - +rows[0].ts) / (365.25 * 86_400_000);
    const perYear = (egfr[0] - egfr[egfr.length - 1]) / years;
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

  it("Patient C: waist and triglycerides met, BP met by treatment, HDL and fasting glucose never drawn (3 met, 2 unknown)", () => {
    const c = data.patients.find((p) => p.id === STORY_IDS.C)!;
    expect((c.intake as { medications: string[] }).medications.length).toBeGreaterThan(0);
    expect(series(STORY_IDS.C, "waist_cm").at(-1)!.value).toBeGreaterThanOrEqual(102);
    expect(series(STORY_IDS.C, "triglycerides").at(-1)!.value).toBeGreaterThanOrEqual(1.7);
    expect(series(STORY_IDS.C, "hdl")).toHaveLength(0);
    expect(series(STORY_IDS.C, "fpg")).toHaveLength(0);
    for (const r of data.labReports.filter((l) => l.patientId === STORY_IDS.C)) {
      expect(Object.keys(r.extracted as object)).not.toContain("hdl");
    }
  });

  it("HDL is drawn with every other lab for everyone except Patient C", () => {
    for (const p of data.patients) {
      if (p.id === STORY_IDS.C) continue;
      expect(series(p.id!, "hdl").length, p.name).toBe(series(p.id!, "hba1c").length);
    }
  });

  /** STOP-Bang as RISK_ENGINE §4b fills it: strict thresholds, BP item from the 30-day home mean or treatment. */
  function stopBang(id: string): number {
    const pat = data.patients.find((p) => p.id === id)!;
    const intake = pat.intake as { height_cm: number; medications: string[] };
    const mean = (m: string) => {
      const v = series(id, m).slice(-30).map((o) => o.value);
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    const latest = (m: string) => series(id, m).at(-1)!.value;
    const age = (+anchor - +new Date(pat.dob)) / (365.25 * 86_400_000);
    const bmi = mean("weight_kg") / (intake.height_cm / 100) ** 2;
    const treated = intake.medications.length > 0 || mean("bp_systolic") >= 130 || mean("bp_diastolic") >= 80;
    return (
      latest("sleep_snoring") + latest("sleep_tired") + latest("sleep_observed_apnea") +
      (treated ? 1 : 0) + (bmi > 35 ? 1 : 0) + (age > 50 ? 1 : 0) +
      (latest("neck_cm") > 40 ? 1 : 0) + (pat.sex === "male" ? 1 : 0)
    );
  }

  it("STOP-Bang: Patient B screens high, A intermediate, C low", () => {
    expect(stopBang(STORY_IDS.B)).toBeGreaterThanOrEqual(5);
    expect(stopBang(STORY_IDS.A)).toBe(3);
    expect(stopBang(STORY_IDS.C)).toBeLessThanOrEqual(2);
  });

  it("neck circumference is recorded once per patient and weekly sleep check-ins cover 13 weeks", () => {
    for (const p of data.patients) {
      expect(series(p.id!, "neck_cm"), p.name).toHaveLength(1);
      for (const m of ["sleep_snoring", "sleep_tired", "sleep_observed_apnea"]) {
        const rows = series(p.id!, m);
        expect(rows, `${p.name} ${m}`).toHaveLength(13);
        expect(rows.every((o) => o.value === 0 || o.value === 1)).toBe(true);
      }
    }
  });

  it("controls stay quiet under the 130/80 home BP line (30-day mean)", () => {
    const storyIds = Object.values(STORY_IDS) as string[];
    for (const p of data.patients.filter((q) => !storyIds.includes(q.id!))) {
      const mean = (m: string) => {
        const v = series(p.id!, m).slice(-30).map((o) => o.value);
        return v.reduce((a, b) => a + b, 0) / v.length;
      };
      expect(mean("bp_systolic"), p.name).toBeLessThan(130);
      expect(mean("bp_diastolic"), p.name).toBeLessThan(80);
    }
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
