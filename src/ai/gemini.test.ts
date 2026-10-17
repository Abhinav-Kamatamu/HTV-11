import { describe, expect, it, vi } from "vitest";
import type { Flag } from "@/engine/flags";
import { buildClient, type GenerateJson } from "./gemini";

const t2dFlag: Flag = {
  patientId: "patient-a",
  condition: "t2d",
  kind: "trend",
  severity: "review",
  title: "HbA1c rising 0.3 %/yr, reaches the 6.0% prediabetes line in ~2 yr",
  points: 7,
  contributions: [
    {
      layer: "trend",
      points: 2,
      reason: "HbA1c rising 0.3 %/yr (Sen), reaches the 6.0% prediabetes line in ~2 yr",
      evidence: [{ metric: "hba1c", ts: "2026-09-01T00:00:00.000Z", value: 5.4, unit: "%" }],
      sourceIds: ["diabetes_canada_2018", "mann_1945"],
    },
    {
      layer: "symptom",
      points: 3,
      reason: "Thirst reported 9 times in 6 weeks",
      evidence: [],
      sourceIds: [],
    },
  ],
  evidence: [{ metric: "hba1c", ts: "2026-09-01T00:00:00.000Z", value: 5.4, unit: "%" }],
  rule: "HbA1c rising 0.3 %/yr (Sen), reaches the 6.0% prediabetes line in ~2 yr",
  sourceIds: ["diabetes_canada_2018", "mann_1945"],
  status: "new",
  label: null,
};

const validMeal = {
  items: ["pasta", "salad"],
  kcal: 700,
  carbsG: 90,
  proteinG: 20,
  fatG: 18,
  fibreG: 6,
  sodiumMg: 900,
  confidence: 0.8,
};

describe("buildClient / extract", () => {
  it("returns ok on the first valid response, calling generate once", async () => {
    const generate: GenerateJson = vi.fn(async () => JSON.stringify(validMeal));
    const client = buildClient(generate);

    const result = await client.extractMeal({ base64: "x", mimeType: "image/jpeg" });

    expect(result).toEqual({ status: "ok", data: validMeal });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries once after malformed JSON, then succeeds", async () => {
    const generate: GenerateJson = vi
      .fn()
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce(JSON.stringify(validMeal));
    const client = buildClient(generate);

    const result = await client.extractMeal({ base64: "x", mimeType: "image/jpeg" });

    expect(result).toEqual({ status: "ok", data: validMeal });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("retries once after a schema-invalid response, then falls back to needs_manual_entry", async () => {
    const invalid = { items: [], kcal: 0, carbsG: 0, proteinG: 0, fatG: 0, fibreG: 0, sodiumMg: 0, confidence: 0 };
    const generate: GenerateJson = vi.fn(async () => JSON.stringify(invalid));
    const client = buildClient(generate);

    const result = await client.extractMeal({ base64: "x", mimeType: "image/jpeg" });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("needs_manual_entry");
    if (result.status === "needs_manual_entry") {
      expect(result.confidence).toBe(0);
      expect(result.raw).toEqual(invalid);
      expect(result.error).toBeTruthy();
    }
  });

  it("falls back when generate throws on every attempt", async () => {
    const generate: GenerateJson = vi.fn(async () => {
      throw new Error("network down");
    });
    const client = buildClient(generate);

    const result = await client.extractMeal({ base64: "x", mimeType: "image/jpeg" });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ status: "needs_manual_entry", confidence: 0, raw: undefined, error: "network down" });
  });

  it("falls back on an empty response without retrying past the cap", async () => {
    const generate: GenerateJson = vi.fn(async () => undefined);
    const client = buildClient(generate);

    const result = await client.extractMeal({ base64: "x", mimeType: "image/jpeg" });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("needs_manual_entry");
  });

  it("extractDevice rejects a reading whose unit does not match the fixed unit for that metric", async () => {
    const wrongUnit = { deviceType: "scale", readings: [{ metric: "weight_kg", value: 180, unit: "lb" }], confidence: 0.8 };
    const generate: GenerateJson = vi.fn(async () => JSON.stringify(wrongUnit));
    const client = buildClient(generate);

    const result = await client.extractDevice({ base64: "x", mimeType: "image/jpeg" });

    expect(result.status).toBe("needs_manual_entry");
  });

  it("extractLabs accepts a result already converted to the fixed SI unit", async () => {
    const labs = {
      results: [{ metric: "hba1c", value: 5.9, unit: "%", collectedAt: "2026-06-01T00:00:00.000Z" }],
      confidence: 0.9,
    };
    const generate: GenerateJson = vi.fn(async () => JSON.stringify(labs));
    const client = buildClient(generate);

    const result = await client.extractLabs({ base64: "x", mimeType: "application/pdf" });

    expect(result).toEqual({ status: "ok", data: labs });
  });

  it("codeSymptoms passes the message text to generate and validates the fixed code list", async () => {
    const coding = { codes: [{ code: "thirst", severity: 2 }], redFlag: false, confidence: 0.7 };
    const generate: GenerateJson = vi.fn(async () => JSON.stringify(coding));
    const client = buildClient(generate);

    const result = await client.codeSymptoms("I've been so thirsty lately");

    expect(result).toEqual({ status: "ok", data: coding });
    const call = (generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.promptText).toContain("I've been so thirsty lately");
    expect(call.parts).toEqual([]);
  });

  it("codeSymptoms falls back when Gemini invents a code outside the fixed list", async () => {
    const coding = { codes: [{ code: "made_up_symptom", severity: 1 }], redFlag: false, confidence: 0.4 };
    const generate: GenerateJson = vi.fn(async () => JSON.stringify(coding));
    const client = buildClient(generate);

    const result = await client.codeSymptoms("something odd");

    expect(result.status).toBe("needs_manual_entry");
  });

  it("explainFlag passes only the flag's own sourceIds as the citation allow-list", async () => {
    const explanation = {
      summary: "HbA1c is trending up toward the prediabetes line and the patient has reported frequent thirst.",
      citedSourceIds: ["diabetes_canada_2018"],
    };
    const generate: GenerateJson = vi.fn(async () => JSON.stringify(explanation));
    const client = buildClient(generate);

    const result = await client.explainFlag(t2dFlag);

    expect(result).toEqual({ status: "ok", data: explanation });
    const call = (generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.promptText).toContain("diabetes_canada_2018");
    expect(call.promptText).toContain("mann_1945");
  });

  it("explainFlag falls back when Gemini cites a source outside the flag's own sourceIds", async () => {
    const explanation = {
      summary: "This explanation reaches for a kidney guideline the flag never cited.",
      citedSourceIds: ["kdigo_2024"],
    };
    const generate: GenerateJson = vi.fn(async () => JSON.stringify(explanation));
    const client = buildClient(generate);

    const result = await client.explainFlag(t2dFlag);

    expect(result.status).toBe("needs_manual_entry");
  });

  it("visitSummary unions sourceIds across all the flags it is given", async () => {
    const ckdFlag: Flag = {
      ...t2dFlag,
      condition: "ckd",
      sourceIds: ["kdigo_2024"],
      contributions: [{ layer: "threshold", points: 2, reason: "ACR 3.2, unconfirmed", evidence: [], sourceIds: ["kdigo_2024"] }],
    };
    const summary = {
      bullets: ["HbA1c is trending toward prediabetes.", "A single elevated ACR result needs a repeat test."],
      citedSourceIds: ["diabetes_canada_2018", "kdigo_2024"],
    };
    const generate: GenerateJson = vi.fn(async () => JSON.stringify(summary));
    const client = buildClient(generate);

    const result = await client.visitSummary({ patientName: "Patient A", flags: [t2dFlag, ckdFlag] });

    expect(result).toEqual({ status: "ok", data: summary });
    const call = (generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.promptText).toContain("kdigo_2024");
  });

  it("visitSummary falls back when Gemini cites a source none of the flags carry", async () => {
    const summary = { bullets: ["An unrelated claim."], citedSourceIds: ["sen_1968"] };
    const generate: GenerateJson = vi.fn(async () => JSON.stringify(summary));
    const client = buildClient(generate);

    const result = await client.visitSummary({ patientName: "Patient A", flags: [t2dFlag] });

    expect(result.status).toBe("needs_manual_entry");
  });
});
