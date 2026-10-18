import { describe, expect, it } from "vitest";
import { generateSeed } from "../db/seed/generate";
import { SILENT_ID, STORY_IDS } from "../db/seed/ids";
import { evaluate, type Evaluation } from "./evaluate";
import { rankPatients, toFlags, type Flag, type PatientFlags } from "./flags";
import { isSourceId } from "./sources";
import type { Severity } from "./points";
import { buildRecord } from "./record";

// ---- Seeded story patients, same fixtures as evaluate.test.ts ------------------------------------

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

const flagsFor = (id: string): Flag[] => toFlags(evaluateSeed(id));
const findFlag = (flags: Flag[], condition: string): Flag => flags.find((f) => f.condition === condition)!;

describe("toFlags: kind selection", () => {
  it("Patient A's t2d flag: the symptom row has the most points (3), so kind is symptom_cluster", () => {
    const t2d = findFlag(flagsFor(STORY_IDS.A), "t2d");
    expect(t2d.points).toBe(7);
    expect(t2d.severity).toBe("review");
    expect(t2d.kind).toBe("symptom_cluster");
    expect(t2d.title).toBe(t2d.rule);
    expect(t2d.title).toContain("9 symptom logs");
  });

  it("Patient B's ckd flag ties threshold (ACR, 2) and trend (eGFR, 2); threshold wins the tie-break", () => {
    const ckd = findFlag(flagsFor(STORY_IDS.B), "ckd");
    expect(ckd.points).toBe(4);
    expect(ckd.severity).toBe("review");
    expect(ckd.kind).toBe("threshold");
    expect(ckd.label).toBe("unconfirmed, repeat test suggested");
  });

  it("Patient B's osa flag is kind sleep", () => {
    const osa = findFlag(flagsFor(STORY_IDS.B), "osa");
    expect(osa.kind).toBe("sleep");
    expect(osa.severity).toBe("monitor");
  });

  it("Patient C's only flag is mets, kind cooccurrence", () => {
    const flags = flagsFor(STORY_IDS.C);
    expect(flags.map((f) => f.condition)).toEqual(["mets"]);
    expect(flags[0].kind).toBe("cooccurrence");
  });

  it("Rosa (silent): a single engagement flag, kind gap, label null", () => {
    const flags = flagsFor(SILENT_ID);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("gap");
    expect(flags[0].label).toBeNull();
  });

  it("Walter Hughes: t2d, ckd and htn all come out urgent", () => {
    const flags = flagsFor(STORY_IDS.URGENT);
    for (const cond of ["t2d", "ckd", "htn"]) {
      expect(findFlag(flags, cond).severity, cond).toBe("urgent");
    }
  });
});

describe("toFlags: filtering and unioning", () => {
  it("only emits a flag for ledgers with a non-null severity", () => {
    const e = evaluateSeed(STORY_IDS.C);
    const severityless = e.conditions.filter((l) => l.severity === null);
    expect(severityless.length).toBeGreaterThan(0); // masld has points (FLI) but no flag
    const flags = toFlags(e);
    expect(flags.every((f) => severityless.every((l) => l.condition !== f.condition))).toBe(true);
  });

  it("never turns a red flag into a condition Flag", () => {
    const e = evaluateSeed(STORY_IDS.URGENT);
    expect(e.redFlags.length).toBeGreaterThan(0);
    const flags = toFlags(e);
    expect(flags.some((f) => (f.condition as string) === "chest_pain")).toBe(false);
  });

  it("unions sourceIds across every contribution, deduplicated", () => {
    const t2d = findFlag(flagsFor(STORY_IDS.A), "t2d");
    expect(new Set(t2d.sourceIds).size).toBe(t2d.sourceIds.length);
    expect(t2d.sourceIds.every((s) => isSourceId(s))).toBe(true);
    // trend (hba1c + mann/sen) and sleep (chung) both contribute, so the union has more than one row's sources
    expect(t2d.sourceIds.length).toBeGreaterThan(2);
  });

  it("unions evidence across every contribution, deduplicated and non-empty", () => {
    const t2d = findFlag(flagsFor(STORY_IDS.A), "t2d");
    const keys = t2d.evidence.map((e) => `${e.metric}|${e.ts}|${e.value}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(t2d.evidence.length).toBeGreaterThan(0);
  });

  it("every evaluated seed patient round-trips: flag count equals the number of non-null ledgers", () => {
    for (const p of seed.patients) {
      const e = evaluateSeed(p.id!);
      const flagged = e.conditions.filter((l) => l.severity !== null);
      expect(toFlags(e), p.name).toHaveLength(flagged.length);
    }
  });
});

// ---- rankPatients ----------------------------------------------------------------------------

const mkFlag = (over: Partial<Flag> = {}): Flag => ({
  patientId: "p",
  condition: "t2d",
  kind: "threshold",
  severity: "monitor",
  title: "t",
  points: 0,
  contributions: [],
  evidence: [],
  rule: "t",
  sourceIds: [],
  status: "new",
  label: null,
  ...over,
});

const mkPatient = (patientId: string, severity: Severity, points: number, normalizedSlope = 0, condition: Flag["condition"] = "t2d"): PatientFlags => ({
  patientId,
  flags: [mkFlag({ patientId, severity, points, condition, contributions: [{ layer: "trend", points, reason: "r", evidence: [], sourceIds: [], normalizedSlope }] })],
});

describe("rankPatients", () => {
  it("ranks by max severity first, regardless of points", () => {
    const low = mkPatient("low-points-urgent", "urgent", 10);
    const high = mkPatient("high-points-review", "review", 100);
    expect(rankPatients([high, low]).map((p) => p.patientId)).toEqual(["low-points-urgent", "high-points-review"]);
  });

  it("ties on severity, breaks on total points across all of the patient's flags", () => {
    const a: PatientFlags = { patientId: "a", flags: [mkFlag({ patientId: "a", severity: "review", points: 3 }), mkFlag({ patientId: "a", severity: "review", points: 3, condition: "htn" })] };
    const b: PatientFlags = { patientId: "b", flags: [mkFlag({ patientId: "b", severity: "review", points: 5 })] };
    expect(rankPatients([b, a]).map((p) => p.patientId)).toEqual(["a", "b"]); // 6 total beats 5
  });

  it("ties on severity and points, breaks on the steepest normalized slope", () => {
    const steep = mkPatient("steep", "review", 5, 0.5);
    const shallow = mkPatient("shallow", "review", 5, 0.1);
    expect(rankPatients([shallow, steep]).map((p) => p.patientId)).toEqual(["steep", "shallow"]);
  });

  it("a gap-only patient never outranks a clinical one, even with higher severity and points", () => {
    const gapOnly = mkPatient("gap-only", "urgent", 999, 99, "engagement");
    const clinical = mkPatient("clinical", "monitor", 3, 0, "t2d");
    expect(rankPatients([gapOnly, clinical]).map((p) => p.patientId)).toEqual(["clinical", "gap-only"]);
  });

  it("two gap-only patients still order against each other by severity/points", () => {
    const bigger = mkPatient("bigger-gap", "monitor", 5, 0, "engagement");
    const smaller = mkPatient("smaller-gap", "monitor", 1, 0, "engagement");
    expect(rankPatients([smaller, bigger]).map((p) => p.patientId)).toEqual(["bigger-gap", "smaller-gap"]);
  });

  it("a gap-only patient still outranks one with no open flags at all", () => {
    // Regression: `isGapOnly` compared pairwise as a boolean put a 0-flag patient in the same "not
    // gap-only" bucket as a clinical-flag patient, so gap-only sorted below BOTH instead of just
    // below clinical ones — caught live, Rosa Delgado (the seed's one silent patient) ranked dead
    // last, below all 20 flagless controls, in the real queue.
    const gapOnly = mkPatient("gap-only", "monitor", 1, 0, "engagement");
    const noFlags: PatientFlags = { patientId: "no-flags", flags: [] };
    expect(rankPatients([noFlags, gapOnly]).map((p) => p.patientId)).toEqual(["gap-only", "no-flags"]);
  });

  it("falls back to patientId for a total tie, so the order is deterministic", () => {
    const x = mkPatient("x", "monitor", 3);
    const z = mkPatient("z", "monitor", 3);
    expect(rankPatients([z, x]).map((p) => p.patientId)).toEqual(["x", "z"]);
  });

  it("orders the real seed patients: urgent first, then review by total points, then monitor, gap-only last", () => {
    const order = ["URGENT", "B", "A", "C", "SILENT"] as const;
    const byName: Record<string, string> = { URGENT: STORY_IDS.URGENT, B: STORY_IDS.B, A: STORY_IDS.A, C: STORY_IDS.C, SILENT: SILENT_ID };
    const patients: PatientFlags[] = order.map((name) => ({ patientId: byName[name], flags: flagsFor(byName[name]) }));
    const ranked = rankPatients([...patients].reverse());
    expect(ranked.map((p) => p.patientId)).toEqual(order.map((name) => byName[name]));
  });
});
