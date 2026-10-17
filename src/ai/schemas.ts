// zod schemas for every Gemini response (RISK_ENGINE.md §10, ARCHITECTURE.md's "validate every Gemini
// response" rule). Gemini extracts structure; it never computes a risk score or a points contribution.

import { z } from "zod";
import { isSymptomCode } from "@/engine/symptoms";

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
