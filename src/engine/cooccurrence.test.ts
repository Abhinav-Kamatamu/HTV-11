import { describe, expect, it } from "vitest";
import { evaluateMets, type MetsInput } from "./cooccurrence";
import { DAY_MS, DAYS_PER_YEAR } from "./types";

const now = Date.UTC(2026, 9, 17);
const pt = (daysAgo: number, value: number) => ({ ts: now - daysAgo * DAY_MS, value });

const base: MetsInput = {
  sex: "male",
  onTreatment: false,
  now,
  waist: [],
  triglycerides: [],
  hdl: [],
  fpg: [],
  homeBp: null,
};

describe("evaluateMets", () => {
  it("every criterion is unknown with no data, and 'unknown' never counts as met", () => {
    const r = evaluateMets(base);
    expect(r.metCount).toBe(0);
    expect(r.unknownCount).toBe(5);
    expect(r.fires).toBe(false);
    for (const c of Object.values(r.criteria)) expect(c.status).toBe("unknown");
  });

  it("waist: sex-specific cutoffs, met at >= cutoff", () => {
    const male = evaluateMets({ ...base, sex: "male", waist: [pt(10, 101.9)] });
    expect(male.criteria.waist.status).toBe("not_met");
    expect(evaluateMets({ ...base, sex: "male", waist: [pt(10, 102)] }).criteria.waist.status).toBe("met");

    const female = evaluateMets({ ...base, sex: "female", waist: [pt(10, 87.9)] });
    expect(female.criteria.waist.status).toBe("not_met");
    expect(evaluateMets({ ...base, sex: "female", waist: [pt(10, 88)] }).criteria.waist.status).toBe("met");
  });

  it("waist has no treatment override (not one of Alberti's drug-treated criteria)", () => {
    const r = evaluateMets({ ...base, sex: "male", onTreatment: true, waist: [pt(10, 90)] });
    expect(r.criteria.waist.status).toBe("not_met");
    expect(r.criteria.waist.byTreatment).toBe(false);
  });

  it("labs and waist use the latest value within 12 months, not an average", () => {
    const r = evaluateMets({ ...base, triglycerides: [pt(10, 1.0), pt(400, 5.0)] });
    expect(r.criteria.triglycerides.value).toBe(1.0);
    expect(r.criteria.triglycerides.status).toBe("not_met");
  });

  it("a reading older than 12 months is unknown, not not_met", () => {
    const old = pt(Math.ceil(DAYS_PER_YEAR) + 1, 0.5); // low value, would be "not_met" if it counted
    const r = evaluateMets({ ...base, triglycerides: [old] });
    expect(r.criteria.triglycerides.status).toBe("unknown");
  });

  it("future-dated readings are ignored", () => {
    const r = evaluateMets({ ...base, fpg: [pt(-1, 9.9)] });
    expect(r.criteria.fpg.status).toBe("unknown");
  });

  it("HDL: sex-specific cutoffs, met when strictly below", () => {
    expect(evaluateMets({ ...base, sex: "male", hdl: [pt(10, 1.0)] }).criteria.hdl.status).toBe("not_met");
    expect(evaluateMets({ ...base, sex: "male", hdl: [pt(10, 0.99)] }).criteria.hdl.status).toBe("met");
    expect(evaluateMets({ ...base, sex: "female", hdl: [pt(10, 1.3)] }).criteria.hdl.status).toBe("not_met");
    expect(evaluateMets({ ...base, sex: "female", hdl: [pt(10, 1.29)] }).criteria.hdl.status).toBe("met");
  });

  it("treatment overrides triglycerides and HDL to met when the reading alone would not be, keeping the reading", () => {
    const r = evaluateMets({
      ...base,
      onTreatment: true,
      triglycerides: [pt(10, 0.5)], // well under threshold
      hdl: [pt(10, 2.0)], // well above threshold
    });
    expect(r.criteria.triglycerides).toMatchObject({ status: "met", byTreatment: true, value: 0.5 });
    expect(r.criteria.hdl).toMatchObject({ status: "met", byTreatment: true, value: 2.0 });
  });

  it("met by data takes priority over met by treatment: the real reading is kept, not hidden behind the override", () => {
    const r = evaluateMets({ ...base, onTreatment: true, triglycerides: [pt(10, 2.2)] });
    expect(r.criteria.triglycerides).toMatchObject({ status: "met", byTreatment: false, value: 2.2 });
  });

  it("treatment never manufactures 'met' out of a criterion that was never measured", () => {
    const r = evaluateMets({ ...base, onTreatment: true });
    expect(r.criteria.triglycerides.status).toBe("unknown");
    expect(r.criteria.hdl.status).toBe("unknown");
    expect(r.criteria.bp.status).toBe("unknown");
  });

  it("treatment never overrides fasting glucose", () => {
    const unknown = evaluateMets({ ...base, onTreatment: true });
    expect(unknown.criteria.fpg.status).toBe("unknown");

    const controlled = evaluateMets({ ...base, onTreatment: true, fpg: [pt(10, 4.0)] });
    expect(controlled.criteria.fpg).toMatchObject({ status: "not_met", value: 4.0, byTreatment: false });
  });

  it("fasting glucose: met at >= 5.6", () => {
    expect(evaluateMets({ ...base, fpg: [pt(10, 5.5)] }).criteria.fpg.status).toBe("not_met");
    expect(evaluateMets({ ...base, fpg: [pt(10, 5.6)] }).criteria.fpg.status).toBe("met");
  });

  it("BP: from the 30-day mean, high when systolic OR diastolic reaches the cutoff", () => {
    expect(evaluateMets({ ...base, homeBp: { systolic: 129.9, diastolic: 84.9, n: 10, days: 10 } }).criteria.bp.status).toBe("not_met");
    expect(evaluateMets({ ...base, homeBp: { systolic: 130, diastolic: 70, n: 10, days: 10 } }).criteria.bp.status).toBe("met");
    expect(evaluateMets({ ...base, homeBp: { systolic: 110, diastolic: 85, n: 10, days: 10 } }).criteria.bp.status).toBe("met");
  });

  it("BP: no qualifying 30-day average is unknown", () => {
    expect(evaluateMets({ ...base, homeBp: null }).criteria.bp.status).toBe("unknown");
  });

  it("BP: treatment overrides met even when the controlled average reads normal, keeping the reading", () => {
    const r = evaluateMets({ ...base, onTreatment: true, homeBp: { systolic: 118, diastolic: 76, n: 10, days: 10 } });
    expect(r.criteria.bp).toMatchObject({ status: "met", byTreatment: true, systolic: 118, diastolic: 76 });
  });

  it("fires at exactly 3 of 5 met, not at 2", () => {
    const three = evaluateMets({ ...base, sex: "male", waist: [pt(10, 102)], triglycerides: [pt(10, 1.7)], hdl: [pt(10, 0.5)] });
    expect(three.metCount).toBe(3);
    expect(three.fires).toBe(true);

    const two = evaluateMets({ ...base, sex: "male", waist: [pt(10, 102)], triglycerides: [pt(10, 1.7)], hdl: [pt(10, 1.5)] });
    expect(two.metCount).toBe(2);
    expect(two.fires).toBe(false);
  });

  it("Patient C: waist and triglycerides met by data, BP met by treatment, HDL and FPG unknown (3 met, 2 unknown)", () => {
    const r = evaluateMets({
      sex: "male",
      onTreatment: true, // amlodipine
      now,
      waist: [pt(10, 104)],
      triglycerides: [pt(10, 2.2)],
      hdl: [], // never drawn for Patient C
      fpg: [], // never drawn for Patient C
      homeBp: { systolic: 126, diastolic: 80, n: 10, days: 10 }, // controlled, below the mets BP cutoff on its own
    });
    expect(r.criteria.waist).toMatchObject({ status: "met", byTreatment: false, value: 104 });
    expect(r.criteria.triglycerides).toMatchObject({ status: "met", byTreatment: false, value: 2.2 });
    expect(r.criteria.bp).toMatchObject({ status: "met", byTreatment: true, systolic: 126, diastolic: 80 });
    expect(r.criteria.hdl.status).toBe("unknown");
    expect(r.criteria.fpg.status).toBe("unknown");
    expect(r.metCount).toBe(3);
    expect(r.unknownCount).toBe(2);
    expect(r.fires).toBe(true);
  });

  it("cites Alberti 2009 and the Health Canada waist cutoffs", () => {
    expect(evaluateMets(base).sourceIds).toEqual(["alberti_2009", "health_canada_waist_2003"]);
  });
});
