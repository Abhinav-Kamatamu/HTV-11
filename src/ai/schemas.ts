// zod schemas for every Gemini response (RISK_ENGINE.md §10, ARCHITECTURE.md's "validate every Gemini
// response" rule). Gemini extracts structure; it never computes a risk score or a points contribution.

import { z } from "zod";
import { isSourceId, type SourceId } from "@/engine/sources";
import { isSymptomCode, normalizeSymptomCode } from "@/engine/symptoms";

const confidence = z.number().min(0).max(1);

// Lab and device metric names/units mirror the contract in src/db/seed/generate.ts `UNITS`
// (docs/DECISIONS.md 2026-10-17 04:10). Duplicated rather than imported: src/db is core's lane.
// If that contract changes, update both.
const LAB_METRICS = [
  "hba1c", "fpg", "creatinine", "egfr", "acr", "alt", "ast", "ggt", "platelets", "triglycerides", "hdl",
] as const;
export type LabMetric = (typeof LAB_METRICS)[number];
export const LAB_METRIC_UNITS: Record<LabMetric, string> = {
  hba1c: "%",
  fpg: "mmol/L",
  creatinine: "µmol/L",
  egfr: "mL/min/1.73m²",
  acr: "mg/mmol",
  alt: "U/L",
  ast: "U/L",
  ggt: "U/L",
  platelets: "10^9/L",
  triglycerides: "mmol/L",
  hdl: "mmol/L",
};
export const isLabMetric = (m: string): m is LabMetric => (LAB_METRICS as readonly string[]).includes(m);

const DEVICE_METRICS = ["bp_systolic", "bp_diastolic", "resting_hr", "steps", "weight_kg", "sleep_hours"] as const;
export type DeviceMetric = (typeof DEVICE_METRICS)[number];
export const DEVICE_METRIC_UNITS: Record<DeviceMetric, string> = {
  bp_systolic: "mmHg",
  bp_diastolic: "mmHg",
  resting_hr: "bpm",
  steps: "steps",
  weight_kg: "kg",
  sleep_hours: "h",
};

// extractMeal(photo) -> items, estimated kcal, carbs/protein/fat/fibre g, sodium mg, confidence.
export const MealExtractionSchema = z.object({
  items: z.array(z.string().min(1)).min(1),
  kcal: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fibreG: z.number().nonnegative(),
  sodiumMg: z.number().nonnegative(),
  confidence,
});
export type MealExtraction = z.infer<typeof MealExtractionSchema>;

// extractDevice(photo) -> device type, readings with units, timestamp if visible.
const DeviceReadingSchema = z
  .object({
    metric: z.enum(DEVICE_METRICS),
    value: z.number(),
    unit: z.string(),
  })
  .refine((r) => r.unit === DEVICE_METRIC_UNITS[r.metric], {
    message: "unit must match the fixed SI unit for this metric",
    path: ["unit"],
  });
export const DeviceExtractionSchema = z.object({
  deviceType: z.string().min(1),
  readings: z.array(DeviceReadingSchema).min(1),
  timestamp: z.string().datetime().nullable().optional(),
  confidence,
});
export type DeviceExtraction = z.infer<typeof DeviceExtractionSchema>;

// extractLabs(pdf|photo) -> lab name, value, unit, reference range, collection date. Converted to SI
// by the prompt; the refine below rejects anything Gemini did not convert.
const LabResultSchema = z
  .object({
    metric: z.enum(LAB_METRICS),
    value: z.number(),
    unit: z.string(),
    rawName: z.string().optional(),
    referenceRange: z.string().optional(),
    collectedAt: z.string().datetime().optional(),
  })
  .refine((r) => r.unit === LAB_METRIC_UNITS[r.metric], {
    message: "unit must already be converted to the fixed SI unit for this metric",
    path: ["unit"],
  });
export const LabExtractionSchema = z.object({
  results: z.array(LabResultSchema),
  confidence,
});
export type LabExtraction = z.infer<typeof LabExtractionSchema>;

// codeSymptoms(text) -> symptom codes from the fixed list (src/engine/symptoms.ts) + severity + red-flag.
// No `.transform()` here on purpose: this same schema is also run through `z.toJSONSchema()` to build
// the `responseJsonSchema` sent to Gemini (see `extract()` in gemini.ts), and zod can't represent a
// transform in JSON Schema ("Transforms cannot be represented in JSON Schema") — confirmed by actually
// trying it. The code-vs-label normalization instead happens on the raw parsed JSON before validation;
// see `normalizeSymptomCoding` below and `extract()`'s `normalize` hook.
const SymptomCodingEntrySchema = z.object({
  code: z.string().refine(isSymptomCode, { message: "unknown symptom code" }),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export const SymptomCodingSchema = z.object({
  codes: z.array(SymptomCodingEntrySchema),
  redFlag: z.boolean(),
  confidence,
});
export type SymptomCoding = z.infer<typeof SymptomCodingSchema>;

/**
 * Normalizes `codes[].code` on the *raw parsed JSON*, before `SymptomCodingSchema` validates it —
 * see that schema's comment for why this can't be a zod `.transform()`. Maps a label Gemini
 * returned by mistake (e.g. `"Excessive thirst"`) back to its code (`"thirst"`); human-found live,
 * 2026-10-18, on input the model had clearly understood correctly (0.95 confidence, right
 * severity, correct redFlag) but encoded with the wrong token. Defensive on shape: returns the
 * input unchanged if it doesn't look like a symptom-coding response at all, so a genuinely
 * malformed response still fails validation with its real error instead of being silently passed
 * through here.
 */
export function normalizeSymptomCoding(json: unknown): unknown {
  if (typeof json !== "object" || json === null || !Array.isArray((json as { codes?: unknown }).codes)) {
    return json;
  }
  const { codes, ...rest } = json as { codes: unknown[] };
  return {
    ...rest,
    codes: codes.map((entry) =>
      typeof entry === "object" && entry !== null && typeof (entry as { code?: unknown }).code === "string"
        ? { ...entry, code: normalizeSymptomCode((entry as { code: string }).code) }
        : entry,
    ),
  };
}

// explainFlag / visitSummary (RISK_ENGINE §10): "cites only the given sources, may not change points."
// `points` never appears in either output schema, so Gemini has no field to put a score in. The citation
// list is not all of SOURCES — each call builds the schema from exactly the sourceIds already present on
// the ledger rows it was shown, so Gemini cannot cite a source it was not given.
const citedSourceIds = (allowed: readonly SourceId[]) => {
  const allowedSet = new Set(allowed);
  return z
    .array(z.string().refine(isSourceId, { message: "unknown source id" }))
    .refine((ids) => ids.every((id) => allowedSet.has(id as SourceId)), {
      message: "may only cite a source already on the contribution(s) it was given",
    });
};

export function buildExplanationSchema(allowedSourceIds: readonly SourceId[]) {
  return z.object({
    summary: z.string().min(20).max(700),
    citedSourceIds: citedSourceIds(allowedSourceIds),
  });
}
export type FlagExplanation = z.infer<ReturnType<typeof buildExplanationSchema>>;

export function buildVisitSummarySchema(allowedSourceIds: readonly SourceId[]) {
  return z.object({
    bullets: z.array(z.string().min(5).max(300)).min(1).max(10),
    citedSourceIds: citedSourceIds(allowedSourceIds),
  });
}
export type VisitSummary = z.infer<ReturnType<typeof buildVisitSummarySchema>>;
