import { describe, expect, it } from "vitest";
import { generateSeed } from "../db/seed/generate";
import { STORY_IDS } from "../db/seed/ids";
import {
  activeRedFlags, clusterScores, isSymptomCode, reportCount, SYMPTOM_PARAMS, SYMPTOMS, type SymptomLogInput,
} from "./symptoms";
import { DAY_MS } from "./types";

const now = Date.UTC(2026, 9, 17);
const log = (daysAgo: number, ...codes: SymptomLogInput["codes"]): SymptomLogInput => ({ ts: now - daysAgo * DAY_MS, codes });
const score = (logs: SymptomLogInput[], condition: string) => clusterScores(logs, now).find((c) => c.condition === condition);

describe("code list", () => {
  it("has sane weights and at least one red flag", () => {
    for (const [code, def] of Object.entries(SYMPTOMS)) {
      for (const w of Object.values(def.weights as Record<string, number>)) {
        expect(w, code).toBeGreaterThan(0);
        expect(w, code).toBeLessThanOrEqual(1);
      }
      if ("redFlag" in def) expect(Object.keys(def.weights), code).toHaveLength(0);
    }
    expect(["chest_pain", "stroke_signs"].every(isSymptomCode)).toBe(true);
    expect(isSymptomCode("toString")).toBe(false);
  });
});

describe("decayed cluster score", () => {
  it("is weight × severity × exp(−age/21)", () => {
    const s = score([log(0, { code: "thirst", severity: 2 })], "t2d")!;
    expect(s.raw).toBeCloseTo(0.8 * 2, 10);
    expect(score([log(21, "thirst")], "t2d")!.raw).toBeCloseTo(0.8 * Math.exp(-1), 10);
  });

  it("one minor headache is worth nothing and fades", () => {
    expect(score([log(0, "headache")], "htn")!.points).toBe(0);
    expect(score([log(0, { code: "headache", severity: 3 })], "htn")!.points).toBe(0.5);
    expect(score([log(30, { code: "headache", severity: 3 })], "htn")!.points).toBe(0);
    expect(score([log(120, { code: "headache", severity: 3 })], "htn")!.raw).toBeLessThan(0.01);
  });

  it("nine reports of thirst in six weeks add up and hit the cap", () => {
    const logs = [3, 7, 11, 15, 19, 23, 27, 33, 40].map((d) => log(d, "thirst"));
    const s = score(logs, "t2d")!;
    expect(s.raw).toBeGreaterThan(3);
    expect(s.points).toBe(3);
  });

  it("rounds to 0.5 and ignores future logs and unknown codes", () => {
    const s = score([log(0, "thirst"), log(-2, "thirst"), log(1, "not_a_symptom")], "t2d")!;
    expect(s.raw).toBeCloseTo(0.8 * Math.exp(0), 10); // only the log from today counts
    expect(s.points).toBe(1); // 0.8 is nearer 1.0 than 0.5
  });

  it("attributes one code to every cluster it belongs to", () => {
    const logs = [log(0, "nocturia")];
    expect(score(logs, "t2d")!.raw).toBeCloseTo(0.4, 10);
    expect(score(logs, "ckd")!.raw).toBeCloseTo(0.2, 10);
    expect(score(logs, "masld")).toBeUndefined();
  });

  it("reports contributing logs newest first", () => {
    const s = score([log(10, "thirst"), log(2, "fatigue"), log(5, "thirst")], "t2d")!;
    expect(s.reports.map((r) => r.code)).toEqual(["fatigue", "thirst", "thirst"]);
  });
});

describe("red flags", () => {
  it("fire from a red-flag code inside the active window", () => {
    expect(activeRedFlags([log(1, "chest_pain", "dyspnea")], now)).toEqual([{ ts: now - DAY_MS, code: "chest_pain" }]);
    expect(activeRedFlags([log(SYMPTOM_PARAMS.redFlagActiveDays + 1, "chest_pain")], now)).toEqual([]);
  });

  it("do not fire for ordinary symptoms, but an upstream flag is never ignored", () => {
    expect(activeRedFlags([log(1, "dyspnea", "thirst")], now)).toEqual([]);
    expect(activeRedFlags([{ ts: now - DAY_MS, codes: [], redFlag: true }], now)).toEqual([{ ts: now - DAY_MS, code: "unspecified" }]);
  });

  it("bypass scoring: red-flag codes add no cluster points", () => {
    expect(clusterScores([log(0, "chest_pain")], now)).toEqual([]);
  });
});

describe("reportCount", () => {
  it("counts logs mentioning any of the codes inside the window", () => {
    const logs = [log(1, "thirst"), log(10, "thirst", "fatigue"), log(50, "thirst")];
    expect(reportCount(logs, ["thirst"], now, 42)).toBe(2);
    expect(reportCount(logs, ["thirst", "fatigue"], now, 60)).toBe(3);
  });
});

describe("on the seed", () => {
  const anchor = Date.parse("2026-10-17T00:00:00Z");
  const data = generateSeed(new Date(anchor));
  const logsOf = (id: string): SymptomLogInput[] =>
    data.symptomLogs.filter((l) => l.patientId === id).map((l) => ({ ts: +l.ts, codes: l.codes as string[], redFlag: l.redFlag }));

  it("Patient A's thirst and fatigue reports give a t2d cluster of 3 points", () => {
    const logs = logsOf(STORY_IDS.A);
    const s = clusterScores(logs, anchor).find((c) => c.condition === "t2d")!;
    expect(s.raw).toBeGreaterThan(2.5);
    expect(s.points).toBe(3);
    expect(reportCount(logs, ["thirst"], anchor, 42)).toBe(6);
    expect(reportCount(logs, ["thirst", "fatigue"], anchor, 42)).toBe(9);
  });

  it("Patient B's swelling and headache are small; the urgent case has an active red flag", () => {
    const b = clusterScores(logsOf(STORY_IDS.B), anchor);
    expect(Math.max(...b.map((c) => c.points))).toBeLessThanOrEqual(0.5);
    expect(activeRedFlags(logsOf(STORY_IDS.URGENT), anchor).map((r) => r.code)).toEqual(["chest_pain"]);
    expect(activeRedFlags(logsOf(STORY_IDS.A), anchor)).toEqual([]);
  });
});
