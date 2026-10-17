import { describe, expect, it } from "vitest";
import {
  DeviceExtractionSchema,
  LabExtractionSchema,
  MealExtractionSchema,
  SymptomCodingSchema,
} from "./schemas";

describe("MealExtractionSchema", () => {
  it("accepts a well-formed extraction", () => {
    const result = MealExtractionSchema.safeParse({
      items: ["grilled chicken", "rice"],
      kcal: 650,
      carbsG: 70,
      proteinG: 40,
      fatG: 15,
      fibreG: 4,
      sodiumMg: 800,
      confidence: 0.7,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty items list", () => {
    const result = MealExtractionSchema.safeParse({
      items: [],
      kcal: 0,
      carbsG: 0,
      proteinG: 0,
      fatG: 0,
      fibreG: 0,
      sodiumMg: 0,
      confidence: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence outside 0 to 1", () => {
    const result = MealExtractionSchema.safeParse({
      items: ["toast"],
      kcal: 100,
      carbsG: 20,
      proteinG: 3,
      fatG: 2,
      fibreG: 1,
      sodiumMg: 150,
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("DeviceExtractionSchema", () => {
  it("accepts a reading in its fixed unit", () => {
    const result = DeviceExtractionSchema.safeParse({
      deviceType: "blood pressure monitor",
      readings: [
        { metric: "bp_systolic", value: 128, unit: "mmHg" },
        { metric: "bp_diastolic", value: 82, unit: "mmHg" },
      ],
      confidence: 0.9,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a reading in the wrong unit", () => {
    const result = DeviceExtractionSchema.safeParse({
      deviceType: "scale",
      readings: [{ metric: "weight_kg", value: 180, unit: "lb" }],
      confidence: 0.8,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown metric", () => {
    const result = DeviceExtractionSchema.safeParse({
      deviceType: "scale",
      readings: [{ metric: "waist_cm", value: 100, unit: "cm" }],
      confidence: 0.8,
    });
    expect(result.success).toBe(false);
  });
});

describe("LabExtractionSchema", () => {
  it("accepts a result already converted to the fixed SI unit", () => {
    const result = LabExtractionSchema.safeParse({
      results: [
        {
          metric: "hba1c",
          value: 5.8,
          unit: "%",
          rawName: "Hemoglobin A1c",
          referenceRange: "< 6.0%",
          collectedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      confidence: 0.85,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a result left in a non-SI unit (e.g. creatinine in mg/dL)", () => {
    const result = LabExtractionSchema.safeParse({
      results: [{ metric: "creatinine", value: 1.1, unit: "mg/dL" }],
      confidence: 0.6,
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty results array (nothing recognizable on the page)", () => {
    const result = LabExtractionSchema.safeParse({ results: [], confidence: 0.2 });
    expect(result.success).toBe(true);
  });
});

describe("SymptomCodingSchema", () => {
  it("accepts known codes with a severity", () => {
    const result = SymptomCodingSchema.safeParse({
      codes: [{ code: "thirst", severity: 2 }],
      redFlag: false,
      confidence: 0.75,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a code outside the fixed list", () => {
    const result = SymptomCodingSchema.safeParse({
      codes: [{ code: "made_up_symptom", severity: 1 }],
      redFlag: false,
      confidence: 0.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a severity outside 1 to 3", () => {
    const result = SymptomCodingSchema.safeParse({
      codes: [{ code: "chest_pain", severity: 4 }],
      redFlag: true,
      confidence: 0.9,
    });
    expect(result.success).toBe(false);
  });
});
