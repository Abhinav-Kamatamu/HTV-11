import { describe, expect, it } from "vitest";
import { buildRecord, type RecordSource } from "./record";

const now = Date.UTC(2026, 9, 17);

const source = (over: Partial<RecordSource> = {}): RecordSource => ({
  patient: { id: "p1", dob: "1970-03-05", sex: "female", intake: { height_cm: 165, medications: ["amlodipine 5 mg"] } },
  observations: [],
  symptomLogs: [],
  ...over,
});

describe("buildRecord", () => {
  it("groups observations by metric, oldest first, and accepts Dates or epoch ms", () => {
    const rec = buildRecord(source({
      observations: [
        { ts: new Date(2000), metric: "hba1c", value: 5.2 },
        { ts: 1000, metric: "hba1c", value: 5.0 },
        { ts: 3000, metric: "fpg", value: 5.1 },
      ],
    }), now);
    expect(rec.obs.hba1c).toEqual([{ ts: 1000, value: 5.0 }, { ts: 2000, value: 5.2 }]);
    expect(rec.obs.fpg).toEqual([{ ts: 3000, value: 5.1 }]);
  });

  it("reads intake fields and the date of birth", () => {
    const rec = buildRecord(source(), now);
    expect(rec.heightCm).toBe(165);
    expect(rec.medications).toEqual(["amlodipine 5 mg"]);
    expect(rec.dobMs).toBe(Date.UTC(1970, 2, 5));
    expect(rec.canriskScore).toBeNull();
    expect(rec.silence).toBeUndefined();
  });

  it("tolerates a missing or malformed intake", () => {
    const rec = buildRecord(source({ patient: { id: "p", dob: "1970-01-01", sex: "male", intake: { height_cm: "tall", medications: "none", canrisk_score: 38 } } }), now);
    expect(rec.heightCm).toBeNull();
    expect(rec.medications).toEqual([]);
    expect(rec.canriskScore).toBe(38);
  });

  it("keeps string and {code, severity} symptom entries, drops anything else, defaults the red flag", () => {
    const rec = buildRecord(source({
      symptomLogs: [{ ts: new Date(5000), codes: ["thirst", { code: "fatigue", severity: 2 }, 42, null, {}] }],
    }), now);
    expect(rec.symptomLogs).toEqual([{ ts: 5000, codes: ["thirst", { code: "fatigue", severity: 2 }], redFlag: false }]);
  });
});
