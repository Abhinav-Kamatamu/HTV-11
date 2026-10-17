import { describe, expect, it } from "vitest";
import { generateSeed } from "../db/seed/generate";
import { SILENT_ID, STORY_IDS } from "../db/seed/ids";
import { detectChangePoints } from "./changepoint";
import { evaluate, type ConditionLedger, type Evaluation } from "./evaluate";
import { totalPoints } from "./points";
import { buildRecord, type PatientRecord } from "./record";
import { isSourceId } from "./sources";
import { DAY_MS, type Pt } from "./types";

const now = Date.UTC(2026, 9, 17);
const at = (daysAgo: number, hour = 7.5) => now - daysAgo * DAY_MS + hour * 3_600_000;

// ---- Fixtures built by hand, so each rule is tested in isolation ---------------------------------

const baseRecord = (over: Partial<PatientRecord> = {}): PatientRecord => ({
  patientId: "p",
  sex: "male",
  dobMs: Date.UTC(1980, 0, 1), // 46, so STOP-Bang's age item is off
  now,
  heightCm: 175,
  medications: [],
  canriskScore: null,
  obs: {},
  symptomLogs: [],
  ...over,
});

/** Lab draws `intervalDays` apart, the newest `newestDaysAgo` days ago. */
const labs = (values: number[], intervalDays: number, newestDaysAgo = 20): Pt[] =>
  values.map((value, i) => ({ ts: at(newestDaysAgo + (values.length - 1 - i) * intervalDays, 8), value }));

/** One reading a day for `days` days with a small deterministic wiggle, the newest `newestDaysAgo` days ago. */
const daily = (days: number, newestDaysAgo: number, f: (i: number) => number): Pt[] =>
  Array.from({ length: days }, (_, i) => ({ ts: at(newestDaysAgo + days - 1 - i), value: f(i) + ((i * 7) % 3) - 1 }));

const ledgerOf = (e: Evaluation, condition: string): ConditionLedger | undefined =>
  e.conditions.find((l) => l.condition === condition);

describe("evaluate: empty and healthy records", () => {
  it("returns no ledgers and no severity for a patient with no data", () => {
    const e = evaluate(baseRecord());
    expect(e.conditions).toEqual([]);
    expect(e.patientSeverity).toBeNull();
    expect(e.redFlags).toEqual([]);
    expect(e.silence).toBeNull();
  });

  it("does not flag a normal HbA1c below the 5.5% at-risk line", () => {
    const e = evaluate(baseRecord({ obs: { hba1c: labs([5.2], 365) } }));
    expect(ledgerOf(e, "t2d")).toBeUndefined();
  });
});

describe("evaluate: threshold layer and severity floors", () => {
  it("a single HbA1c >= 6.5 is diagnostic: 4 points, floored to review", () => {
    const e = evaluate(baseRecord({ obs: { hba1c: labs([6.8], 365) } }));
    const t2d = ledgerOf(e, "t2d")!;
    expect(t2d.points).toBe(4);
    expect(t2d.diagnostic).toBe(true);
    expect(t2d.severity).toBe("review");
    expect(t2d.basis).toBe("diagnostic_floor");
    expect(t2d.contributions[0].reason).toContain("6.8%");
    expect(t2d.contributions[0].sourceIds).toEqual(["diabetes_canada_2018"]);
  });

  it("a single HbA1c 5.5 to 6.4 is 2 points, below the monitor band, but floors at monitor as unconfirmed", () => {
    const e = evaluate(baseRecord({ obs: { hba1c: labs([5.8], 365) } }));
    const t2d = ledgerOf(e, "t2d")!;
    expect(t2d.points).toBe(2);
    expect(t2d.diagnostic).toBe(false);
    expect(t2d.severity).toBe("monitor");
    expect(t2d.basis).toBe("unconfirmed_floor");
    expect(t2d.label).toBe("unconfirmed, repeat test suggested");
    expect(t2d.contributions[0].unconfirmed).toBe(true);
    expect(t2d.contributions[0].reason).toContain("unconfirmed, repeat test suggested");
  });

  it("a single fasting glucose in the 5.6 to 6.9 range floors at monitor; at 7.0 it is diagnostic, not unconfirmed", () => {
    const at = ledgerOf(evaluate(baseRecord({ obs: { fpg: labs([6.3], 365) } })), "t2d")!;
    expect([at.severity, at.basis, at.label]).toEqual(["monitor", "unconfirmed_floor", "unconfirmed, repeat test suggested"]);
    const diag = ledgerOf(evaluate(baseRecord({ obs: { fpg: labs([7.1], 365) } })), "t2d")!;
    expect([diag.severity, diag.basis, diag.label]).toEqual(["review", "diagnostic_floor", null]);
    expect(diag.contributions[0].unconfirmed).toBeUndefined();
  });

  it("HbA1c just under the 5.5 at-risk line stays quiet", () => {
    expect(ledgerOf(evaluate(baseRecord({ obs: { hba1c: labs([5.4], 365) } })), "t2d")).toBeUndefined();
  });

  it("a single eGFR < 60 or ACR >= 3 floors at monitor as unconfirmed", () => {
    for (const obs of [{ egfr: labs([52], 365) }, { acr: labs([3.4], 365) }] as Record<string, Pt[]>[]) {
      const ckd = ledgerOf(evaluate(baseRecord({ obs })), "ckd")!;
      expect([ckd.points, ckd.severity, ckd.basis, ckd.label]).toEqual([2, "monitor", "unconfirmed_floor", "unconfirmed, repeat test suggested"]);
    }
  });

  it("a normal earlier result does not confirm: the latest stays unconfirmed", () => {
    const ckd = ledgerOf(evaluate(baseRecord({ obs: { egfr: labs([75, 58], 200) } })), "ckd")!;
    expect(ckd.label).toBe("unconfirmed, repeat test suggested");
    expect(ckd.diagnostic).toBe(false);
  });

  it("fasting glucose >= 7.0 is diagnostic on its own", () => {
    const e = evaluate(baseRecord({ obs: { fpg: labs([7.2], 365) } }));
    expect(ledgerOf(e, "t2d")!.severity).toBe("review");
  });

  it("eGFR < 60 twice more than 90 days apart is sustained (diagnostic, review)", () => {
    const e = evaluate(baseRecord({ obs: { egfr: labs([55, 54], 120) } }));
    const ckd = ledgerOf(e, "ckd")!;
    expect(ckd.diagnostic).toBe(true);
    expect(ckd.severity).toBe("review");
    expect(ckd.contributions[0].sourceIds).toEqual(["kdigo_2024"]);
  });

  it("eGFR < 60 twice but only 30 days apart is not sustained: unconfirmed, monitor, not diagnostic", () => {
    const e = evaluate(baseRecord({ obs: { egfr: labs([55, 54], 30) } }));
    const ckd = ledgerOf(e, "ckd")!;
    expect(ckd.diagnostic).toBe(false);
    expect(ckd.points).toBe(2);
    expect(ckd.severity).toBe("monitor");
    expect(ckd.label).toBe("unconfirmed, repeat test suggested");
  });

  it("a sustained result carries no unconfirmed label", () => {
    const ckd = ledgerOf(evaluate(baseRecord({ obs: { egfr: labs([55, 54], 120) } })), "ckd")!;
    expect(ckd.label).toBeNull();
    expect(ckd.contributions.some((c) => c.unconfirmed)).toBe(false);
  });

  it("an older in-range result confirms the latest even with a normal one between them", () => {
    const e = evaluate(baseRecord({ obs: { acr: [...labs([4.0], 0, 400), ...labs([2.0], 0, 100), ...labs([3.5], 0, 20)] } }));
    expect(ledgerOf(e, "ckd")!.diagnostic).toBe(true);
  });

  it("home BP averaging >= 130/80 over 7+ days is diagnostic for htn", () => {
    const e = evaluate(baseRecord({
      obs: { bp_systolic: daily(14, 1, () => 138), bp_diastolic: daily(14, 1, () => 84) },
    }));
    const htn = ledgerOf(e, "htn")!;
    expect(htn.diagnostic).toBe(true);
    expect(htn.severity).toBe("review");
    expect(htn.contributions[0].sourceIds).toEqual(["htn_canada_2025"]);
  });

  it("fewer than 7 days of home BP gives no average and no threshold row", () => {
    const e = evaluate(baseRecord({
      obs: { bp_systolic: daily(5, 1, () => 150), bp_diastolic: daily(5, 1, () => 92) },
    }));
    expect(ledgerOf(e, "htn")).toBeUndefined();
  });

  it("two diagnostic conditions make both urgent", () => {
    const e = evaluate(baseRecord({
      obs: { hba1c: labs([7.1], 365), egfr: labs([50, 49], 120) },
    }));
    expect(ledgerOf(e, "t2d")!.severity).toBe("urgent");
    expect(ledgerOf(e, "t2d")!.basis).toBe("multiple_diagnostic");
    expect(ledgerOf(e, "ckd")!.severity).toBe("urgent");
    expect(e.patientSeverity).toBe("urgent");
  });

  it("a threshold row in the same layer past the cap is kept at 0 points", () => {
    const e = evaluate(baseRecord({ obs: { hba1c: labs([7.0], 365), fpg: labs([7.5], 365) } }));
    const rows = ledgerOf(e, "t2d")!.contributions;
    expect(rows.map((r) => r.points)).toEqual([4, 0]);
    expect(totalPoints(rows)).toBe(ledgerOf(e, "t2d")!.points);
  });
});

describe("evaluate: screens never set a floor", () => {
  it("FIB-4 high is 4 points: monitor, not review", () => {
    const e = evaluate(baseRecord({
      dobMs: Date.UTC(1965, 0, 1),
      obs: { ast: labs([90], 365), alt: labs([40], 365), platelets: labs([120], 365) },
    }));
    const masld = ledgerOf(e, "masld")!;
    expect(masld.points).toBe(4);
    expect(masld.severity).toBe("monitor");
    expect(masld.diagnostic).toBe(false);
    expect(masld.contributions[0].reason).toContain("FIB-4");
  });

  it("FIB-4 low adds nothing", () => {
    const e = evaluate(baseRecord({ obs: { ast: labs([22], 365), alt: labs([25], 365), platelets: labs([260], 365) } }));
    expect(ledgerOf(e, "masld")).toBeUndefined();
  });

  it("CANRISK very high is a score row of 3 points for t2d", () => {
    const e = evaluate(baseRecord({ canriskScore: 45 }));
    const t2d = ledgerOf(e, "t2d")!;
    expect(t2d.points).toBe(3);
    expect(t2d.severity).toBe("monitor");
    expect(t2d.contributions[0].layer).toBe("score");
    expect(t2d.contributions[0].sourceIds).toEqual(["canrisk_ctfphc"]);
  });

  it("CANRISK moderate adds nothing", () => {
    expect(ledgerOf(evaluate(baseRecord({ canriskScore: 25 })), "t2d")).toBeUndefined();
  });
});

describe("evaluate: trend layer", () => {
  it("a significant HbA1c trend crossing 6.0 inside the horizon earns 2 points and cites the guideline and the tests", () => {
    const e = evaluate(baseRecord({ obs: { hba1c: labs([4.65, 4.8, 4.95, 5.1, 5.25, 5.4], 182) } }));
    const t2d = ledgerOf(e, "t2d")!;
    const trend = t2d.contributions.find((c) => c.layer === "trend")!;
    expect(trend.points).toBe(2);
    expect(trend.reason).toMatch(/reaches the 6% prediabetes line in about 2\.0 years/);
    expect(trend.sourceIds).toEqual(["diabetes_canada_2018", "mann_1945", "sen_1968"]);
    expect(trend.evidence).toHaveLength(6);
  });

  it("never projects the 6.5% diabetes line", () => {
    const e = evaluate(baseRecord({ obs: { hba1c: labs([4.65, 4.8, 4.95, 5.1, 5.25, 5.4], 182) } }));
    for (const c of ledgerOf(e, "t2d")!.contributions) expect(c.reason).not.toContain("6.5");
  });

  it("a trend needs 4 or more lab points (3 earn nothing)", () => {
    const e = evaluate(baseRecord({ obs: { hba1c: labs([5.0, 5.2, 5.4], 182) } }));
    expect(ledgerOf(e, "t2d")).toBeUndefined();
  });

  it("a crossing within a year earns 4", () => {
    const e = evaluate(baseRecord({ obs: { hba1c: labs([5.0, 5.2, 5.4, 5.6, 5.8], 91) } }));
    const trend = ledgerOf(e, "t2d")!.contributions.find((c) => c.layer === "trend")!;
    expect(trend.points).toBe(4);
  });

  it("an HbA1c already past 6.0 gets the threshold row, not a trend", () => {
    const e = evaluate(baseRecord({ obs: { hba1c: labs([5.8, 6.0, 6.2, 6.3, 6.4], 120) } }));
    expect(ledgerOf(e, "t2d")!.contributions.map((c) => c.layer)).toEqual(["threshold"]);
  });

  it("falling eGFR above 60 earns a 2-point trend, plus a 0-point rapid-decline row citing KDIGO 2012 that floors at review", () => {
    const e = evaluate(baseRecord({ obs: { egfr: labs([88, 85, 82, 79, 76, 73], 182) } }));
    const ckd = ledgerOf(e, "ckd")!;
    const [trend, rapid] = ckd.contributions.filter((c) => c.layer === "trend");
    expect(trend.points).toBe(2);
    expect(rapid.points).toBe(0);
    expect(rapid.reason).toContain("KDIGO rapid decline");
    expect(rapid.sourceIds).toEqual(["kdigo_2012", "mann_1945", "sen_1968"]);
    expect(ckd.points).toBe(2);
    expect(ckd.severity).toBe("review");
    expect(ckd.basis).toBe("rapid_decline_floor");
    expect(ckd.diagnostic).toBe(false);
  });

  it("a slow eGFR decline has no rapid-decline row and no floor", () => {
    const e = evaluate(baseRecord({ obs: { egfr: labs([90, 89, 88, 87, 86, 85], 182) } }));
    const ckd = ledgerOf(e, "ckd");
    expect(ckd?.contributions.some((c) => c.sourceIds.includes("kdigo_2012")) ?? false).toBe(false);
    expect(ckd?.basis ?? "points").not.toBe("rapid_decline_floor");
  });

  it("exactly 5 per year is not rapid (strictly greater)", () => {
    const e = evaluate(baseRecord({ obs: { egfr: labs([85, 82.5, 80, 77.5, 75, 72.5], 182.625) } }));
    expect(ledgerOf(e, "ckd")?.basis ?? "points").not.toBe("rapid_decline_floor");
  });

  it("rapid decline floors at review even when eGFR is already below 60 and there is no trend row", () => {
    const e = evaluate(baseRecord({ obs: { egfr: labs([66, 64, 61, 57], 30) } }));
    const ckd = ledgerOf(e, "ckd")!;
    expect(ckd.contributions.some((c) => c.layer === "trend" && c.points > 0)).toBe(false);
    expect(ckd.contributions.some((c) => c.layer === "trend" && c.points === 0)).toBe(true);
    expect(ckd.severity).toBe("review");
    expect(ckd.basis).toBe("rapid_decline_floor");
  });

  it("rapid decline is not a diagnostic range: with one other diagnostic condition it does not make both urgent", () => {
    const e = evaluate(baseRecord({
      obs: { egfr: labs([88, 85, 82, 79, 76, 73], 182), hba1c: labs([7.1], 365) },
    }));
    expect(ledgerOf(e, "ckd")!.severity).toBe("review");
    expect(ledgerOf(e, "t2d")!.severity).toBe("review");
    expect(e.patientSeverity).toBe("review");
  });

  it("metrics without a guideline threshold never create a trend (ALT)", () => {
    const e = evaluate(baseRecord({ obs: { alt: labs([28, 31, 35, 40, 46, 52], 182) } }));
    expect(e.conditions).toEqual([]);
  });

  it("a flat HbA1c earns nothing", () => {
    const e = evaluate(baseRecord({ obs: { hba1c: labs([5.2, 5.2, 5.2, 5.2, 5.2], 182) } }));
    expect(ledgerOf(e, "t2d")).toBeUndefined();
  });

  it("home BP rising toward 130 inside the horizon earns a vitals trend", () => {
    const e = evaluate(baseRecord({
      obs: { bp_systolic: daily(60, 1, (i) => 112 + i * 0.25), bp_diastolic: daily(60, 1, () => 70) },
    }));
    const trend = ledgerOf(e, "htn")!.contributions.find((c) => c.layer === "trend")!;
    expect(trend.points).toBeGreaterThanOrEqual(2);
    expect(trend.reason).toContain("Home systolic BP rising");
    expect(trend.stale).toBeUndefined();
  });
});

describe("evaluate: supporting layers only count with a primary contribution", () => {
  const sleepy = {
    sleep_snoring: [{ ts: at(7), value: 1 }],
    sleep_tired: [{ ts: at(7), value: 1 }],
    sleep_observed_apnea: [{ ts: at(7), value: 1 }],
    neck_cm: [{ ts: at(100), value: 43 }],
  };
  const older = { dobMs: Date.UTC(1965, 0, 1) }; // age item on: S T O + age + neck + male = 6, high

  it("STOP-Bang high alone fires only the osa flag, at monitor, whatever the points", () => {
    const e = evaluate(baseRecord({ ...older, obs: sleepy }));
    expect(e.stopBang.band).toBe("high");
    expect(e.conditions.map((l) => l.condition)).toEqual(["osa"]);
    const osa = e.conditions[0];
    expect(osa.points).toBe(2);
    expect(osa.severity).toBe("monitor");
    expect(osa.basis).toBe("osa_screen");
    expect(osa.contributions[0].reason).toContain("formal sleep assessment");
    expect(osa.contributions[0].sourceIds).toEqual(["stopbang_chung_2016"]);
  });

  it("STOP-Bang intermediate alone fires nothing", () => {
    const e = evaluate(baseRecord({
      ...older,
      obs: { sleep_snoring: [{ ts: at(7), value: 1 }], sleep_tired: [{ ts: at(7), value: 1 }], sleep_observed_apnea: [{ ts: at(7), value: 0 }] },
    }));
    expect(e.stopBang.band).toBe("intermediate");
    expect(e.conditions).toEqual([]);
  });

  it("with a primary contribution, STOP-Bang high adds 2 sleep points to t2d, htn and masld but not ckd", () => {
    const e = evaluate(baseRecord({
      ...older,
      obs: {
        ...sleepy,
        hba1c: labs([7.0], 365),
        egfr: labs([55], 365),
        bp_systolic: daily(14, 1, () => 140), bp_diastolic: daily(14, 1, () => 88),
        ast: labs([90], 365), alt: labs([40], 365), platelets: labs([120], 365),
      },
    }));
    for (const cond of ["t2d", "htn", "masld"]) {
      expect(ledgerOf(e, cond)!.contributions.some((c) => c.layer === "sleep" && c.points === 2), cond).toBe(true);
    }
    expect(ledgerOf(e, "ckd")?.contributions.some((c) => c.layer === "sleep") ?? false).toBe(false);
  });

  it("a BP change-point alone creates no htn ledger (the +5 mmHg shift is detected, but nothing primary fires)", () => {
    const obs = { bp_systolic: daily(60, 1, (i) => (i < 52 ? 114 : 119)), bp_diastolic: daily(60, 1, () => 70) };
    expect(detectChangePoints(obs.bp_systolic)).toHaveLength(1);
    expect(ledgerOf(evaluate(baseRecord({ obs })), "htn")).toBeUndefined();
  });

  it("a BP change-point on top of a sustained high average adds 1 point (no open trend to agree with)", () => {
    const e = evaluate(baseRecord({
      obs: {
        bp_systolic: daily(70, 1, (i) => (i < 40 ? 120 : 142)),
        bp_diastolic: daily(70, 1, (i) => (i < 40 ? 74 : 88)),
      },
    }));
    const cp = ledgerOf(e, "htn")!.contributions.find((c) => c.layer === "changepoint")!;
    expect(cp.points).toBe(1);
    expect(cp.reason).toMatch(/shifted up about \d+ mmHg around/);
    expect(cp.sourceIds).toEqual(["page_1954"]);
  });
});

describe("evaluate: symptoms", () => {
  it("nine thirst-and-fatigue logs earn the capped 3 symptom points for t2d", () => {
    const logs = [41, 38, 34, 30, 26, 22, 17, 11, 4].map((d) => ({ ts: at(d, 19), codes: ["thirst", "fatigue"] }));
    const e = evaluate(baseRecord({ symptomLogs: logs }));
    const t2d = ledgerOf(e, "t2d")!;
    expect(t2d.contributions).toHaveLength(1);
    expect(t2d.contributions[0].layer).toBe("symptom");
    expect(t2d.contributions[0].points).toBe(3);
    expect(t2d.contributions[0].reason).toContain("9 symptom logs");
    expect(t2d.severity).toBe("monitor");
  });

  it("one old minor headache earns nothing", () => {
    const e = evaluate(baseRecord({ symptomLogs: [{ ts: at(30, 19), codes: ["headache"] }] }));
    expect(e.conditions).toEqual([]);
  });

  it("a red-flag symptom makes the patient urgent without creating a condition flag", () => {
    const e = evaluate(baseRecord({ symptomLogs: [{ ts: at(1, 19), codes: ["chest_pain"], redFlag: true }] }));
    expect(e.redFlags).toHaveLength(1);
    expect(e.patientSeverity).toBe("urgent");
    expect(e.conditions).toEqual([]);
  });

  it("a red flag older than 7 days no longer bypasses", () => {
    const e = evaluate(baseRecord({ symptomLogs: [{ ts: at(9, 19), codes: ["chest_pain"], redFlag: true }] }));
    expect(e.redFlags).toEqual([]);
    expect(e.patientSeverity).toBeNull();
  });
});

describe("evaluate: gap layer and stale trends", () => {
  const silentBp = (): PatientRecord["obs"] => ({
    bp_systolic: daily(60, 12, (i) => 112 + i * 0.3),
    bp_diastolic: daily(60, 12, () => 70),
  });

  it("a patient who stopped logging gets an engagement flag at monitor with the gap row", () => {
    const e = evaluate(baseRecord({ obs: silentBp() }));
    expect(e.silence?.daysSince).toBe(12);
    const gap = ledgerOf(e, "engagement")!;
    expect(gap.points).toBe(1);
    expect(gap.severity).toBe("monitor");
    expect(gap.basis).toBe("gap_only");
    expect(gap.contributions[0].reason).toContain("12 days ago");
  });

  it("marks that patient's daily-series trend as stale instead of reassuring", () => {
    const e = evaluate(baseRecord({ obs: silentBp() }));
    const trend = ledgerOf(e, "htn")!.contributions.find((c) => c.layer === "trend")!;
    expect(trend.stale).toBe(true);
    expect(trend.reason).toContain("Last reading 12 days ago.");
  });

  it("does not mark lab trends stale: labs are not a logging heartbeat", () => {
    const e = evaluate(baseRecord({
      obs: { ...silentBp(), hba1c: labs([4.65, 4.8, 4.95, 5.1, 5.25, 5.4], 182) },
    }));
    const trend = ledgerOf(e, "t2d")!.contributions.find((c) => c.layer === "trend")!;
    expect(trend.stale).toBeUndefined();
  });

  it("the gap never adds points to clinical ledgers", () => {
    const e = evaluate(baseRecord({ obs: silentBp() }));
    expect(ledgerOf(e, "htn")!.contributions.some((c) => c.layer === "gap")).toBe(false);
  });

  it("an explicit null silence (from the database query) overrides detection", () => {
    const e = evaluate(baseRecord({ obs: silentBp(), silence: null }));
    expect(e.silence).toBeNull();
    expect(ledgerOf(e, "engagement")).toBeUndefined();
  });

  it("an explicit silence is used as given", () => {
    const e = evaluate(baseRecord({ silence: { lastTs: at(9), daysSince: 9, activeDays: 20 } }));
    expect(ledgerOf(e, "engagement")!.contributions[0].reason).toContain("9 days ago");
  });
});

describe("evaluate: metabolic syndrome", () => {
  it("3 of 5 criteria met fires mets at monitor with the unknowns listed", () => {
    const e = evaluate(baseRecord({
      obs: {
        waist_cm: [{ ts: at(30), value: 106 }],
        triglycerides: [{ ts: at(30), value: 2.2 }],
        bp_systolic: daily(14, 1, () => 134), bp_diastolic: daily(14, 1, () => 78),
      },
    }));
    const mets = ledgerOf(e, "mets")!;
    expect(mets.points).toBe(3);
    expect(mets.severity).toBe("monitor");
    expect(mets.contributions[0].reason).toContain("3 of 5 criteria met");
    expect(mets.contributions[0].reason).toContain("2 unknown (HDL, fasting glucose)");
    expect(mets.contributions[0].sourceIds).toEqual(["alberti_2009", "health_canada_waist_2003"]);
  });
});

// ---- The seeded story patients (SPEC §6), no database needed -------------------------------------

const anchor = new Date("2026-10-17T00:00:00Z");
const seed = generateSeed(anchor);

function evaluateSeed(id: string): Evaluation {
  const patient = seed.patients.find((p) => p.id === id)!;
  return evaluate(buildRecord({
    patient: { id, dob: patient.dob, sex: patient.sex, intake: patient.intake as Record<string, unknown> },
    observations: seed.observations.filter((o) => o.patientId === id),
    symptomLogs: seed.symptomLogs.filter((l) => l.patientId === id),
  }, +anchor));
}

describe("evaluate: seed story patients", () => {
  it("Patient A: creeping HbA1c, thirst and fatigue, STOP-Bang 3 add up to 7 points: review, t2d", () => {
    const e = evaluateSeed(STORY_IDS.A);
    const t2d = ledgerOf(e, "t2d")!;
    expect(t2d.points).toBe(7);
    expect(t2d.severity).toBe("review");
    expect(t2d.diagnostic).toBe(false);
    expect(t2d.contributions.map((c) => [c.layer, c.points])).toEqual([
      ["trend", 2], ["trend", 1], ["symptom", 3], ["sleep", 1],
    ]);
    expect(t2d.contributions[0].reason).toContain("reaches the 6% prediabetes line in about 2.0 years");
    expect(t2d.contributions[2].reason).toContain("9 symptom logs");
    expect(e.patientSeverity).toBe("review");
    expect(e.redFlags).toEqual([]);
  });

  it("Patient A: the latest HbA1c (5.4) earns no threshold row", () => {
    const t2d = ledgerOf(evaluateSeed(STORY_IDS.A), "t2d")!;
    expect(t2d.contributions.some((c) => c.layer === "threshold")).toBe(false);
  });

  it("Patient B: only htn is diagnostic (ACR 3.2 is a single result); CKD is review by the rapid-decline floor; patient review, not urgent", () => {
    const e = evaluateSeed(STORY_IDS.B);
    const htn = ledgerOf(e, "htn")!;
    expect(htn.diagnostic).toBe(true);
    expect(htn.severity).toBe("review");
    const ckd = ledgerOf(e, "ckd")!;
    expect(ckd.diagnostic).toBe(false);
    expect(ckd.points).toBe(4);
    expect(ckd.severity).toBe("review");
    expect(ckd.basis).toBe("rapid_decline_floor");
    expect(ckd.label).toBe("unconfirmed, repeat test suggested");
    expect(e.patientSeverity).toBe("review");
    expect(e.conditions.filter((l) => l.diagnostic)).toHaveLength(1);
  });

  it("Patient B: eGFR falling ~6/yr is a rapid-decline row, and the BP shift is dated around Sep 3", () => {
    const e = evaluateSeed(STORY_IDS.B);
    const trend = ledgerOf(e, "ckd")!.contributions.find((c) => c.layer === "trend" && c.points === 0)!;
    expect(trend.reason).toContain("eGFR falling");
    expect(trend.reason).toContain("KDIGO rapid decline");
    const cp = ledgerOf(e, "htn")!.contributions.find((c) => c.layer === "changepoint")!;
    expect(cp.reason).toContain("Home systolic shifted up");
    expect(cp.reason).toMatch(/around Sep [1-5] /);
  });

  it("Patient B: STOP-Bang 7 also fires its own osa monitor flag", () => {
    const osa = ledgerOf(evaluateSeed(STORY_IDS.B), "osa")!;
    expect(osa.severity).toBe("monitor");
    expect(osa.basis).toBe("osa_screen");
  });

  it("Patient C: metabolic syndrome 3 of 5 with 2 unknown stays monitor; FIB-4 low, no other flag", () => {
    const e = evaluateSeed(STORY_IDS.C);
    const flagged = e.conditions.filter((l) => l.severity !== null);
    expect(flagged.map((l) => l.condition)).toEqual(["mets"]);
    expect(flagged[0].severity).toBe("monitor");
    expect(flagged[0].contributions[0].reason).toContain("2 unknown (HDL, fasting glucose)");
    expect(e.patientSeverity).toBe("monitor");
  });

  it("Walter Hughes: three diagnostic conditions and a red-flag symptom come out urgent", () => {
    const e = evaluateSeed(STORY_IDS.URGENT);
    expect(e.patientSeverity).toBe("urgent");
    expect(e.redFlags.map((r) => r.code).sort()).toEqual(["chest_pain"]);
    for (const cond of ["t2d", "ckd", "htn"]) {
      expect(ledgerOf(e, cond)!.severity, cond).toBe("urgent");
      expect(ledgerOf(e, cond)!.diagnostic, cond).toBe(true);
    }
  });

  it("Rosa Delgado (silent 11 days): an engagement monitor flag and nothing clinical", () => {
    const e = evaluateSeed(SILENT_ID);
    expect(e.silence?.daysSince).toBe(11);
    expect(e.conditions.filter((l) => l.severity !== null).map((l) => l.condition)).toEqual(["engagement"]);
    expect(e.patientSeverity).toBe("monitor");
  });

  it("all 20 controls come out with no flag at all", () => {
    const controls = seed.patients.filter((p) => (p.intake as { story?: string }).story === "control");
    expect(controls).toHaveLength(20);
    for (const p of controls) {
      const e = evaluateSeed(p.id!);
      expect(e.patientSeverity, p.name).toBeNull();
    }
  });

  it("every ledger adds up, every cited source exists, every row has a reason", () => {
    for (const p of seed.patients) {
      const e = evaluateSeed(p.id!);
      for (const l of e.conditions) {
        expect(totalPoints(l.contributions), `${p.name} ${l.condition}`).toBe(l.points);
        for (const c of l.contributions) {
          expect(c.reason.length).toBeGreaterThan(10);
          for (const s of c.sourceIds) expect(isSourceId(s), s).toBe(true);
        }
      }
    }
  });

  it("is deterministic", () => {
    expect(evaluateSeed(STORY_IDS.A)).toEqual(evaluateSeed(STORY_IDS.A));
  });
});
