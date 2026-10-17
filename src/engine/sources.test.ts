import { describe, expect, it } from "vitest";
import { isSourceId, SOURCES, THRESHOLDS } from "./sources";

describe("SOURCES", () => {
  it("has https urls and non-empty fields", () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      expect(s.url, id).toMatch(/^https:\/\//);
      expect(s.title.length, id).toBeGreaterThan(0);
      expect(s.year, id).toBeGreaterThan(1900);
    }
  });

  it("has unique urls", () => {
    const urls = Object.values(SOURCES).map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("narrows ids", () => {
    expect(isSourceId("kdigo_2024")).toBe(true);
    expect(isSourceId("toString")).toBe(false);
    expect(isSourceId("made_up")).toBe(false);
  });
});

describe("THRESHOLDS", () => {
  it("only cites registered sources", () => {
    const cited: string[] = [];
    const walk = (o: object) => {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === "object" && v !== null) walk(v);
        else if (k === "source" || k.endsWith("Source")) cited.push(v as string);
      }
    };
    walk(THRESHOLDS);
    expect(cited.length).toBeGreaterThan(0);
    for (const id of cited) expect(isSourceId(id), id).toBe(true);
  });

  it("keeps bands ordered", () => {
    const { hba1c, fpg, canrisk, fib4, stopbang } = THRESHOLDS;
    expect(hba1c.atRiskFrom).toBeLessThan(hba1c.prediabetesFrom);
    expect(hba1c.prediabetesFrom).toBeLessThan(hba1c.diabetesFrom);
    expect(fpg.atRiskFrom).toBeLessThan(fpg.prediabetesFrom);
    expect(fpg.prediabetesFrom).toBeLessThan(fpg.diabetesFrom);
    expect(canrisk.moderateFrom).toBeLessThan(canrisk.highFrom);
    expect(fib4.low).toBeLessThan(fib4.lowAge65Plus);
    expect(fib4.lowAge65Plus).toBeLessThan(fib4.high);
    expect(stopbang.intermediateFrom).toBeLessThan(stopbang.highFrom);
  });
});
