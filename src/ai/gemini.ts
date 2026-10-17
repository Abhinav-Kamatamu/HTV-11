// Gemini client (RISK_ENGINE.md §10). Gemini only extracts structure from messy input and writes
// explanations; it never invents a risk score or a points contribution (CLAUDE.md §4).
//
// Every call requests JSON matching a zod schema and is validated. On a failed parse/validation,
// retry once, then return `{ status: "needs_manual_entry" }` carrying the raw response and
// confidence 0, per §10 ("store the raw input with confidence = 0 and surface it as 'needs manual
// entry'"). Callers never see a fabricated extraction.

import { GoogleGenAI, createPartFromBase64 } from "@google/genai";
import { z } from "zod";
import { SYMPTOMS } from "@/engine/symptoms";
import {
  DEVICE_METRIC_UNITS,
  DeviceExtractionSchema,
  LAB_METRIC_UNITS,
  LabExtractionSchema,
  MealExtractionSchema,
  SymptomCodingSchema,
  type DeviceExtraction,
  type LabExtraction,
  type MealExtraction,
  type SymptomCoding,
} from "./schemas";

export type MediaInput = { base64: string; mimeType: string };

export type Extraction<T> =
  | { status: "ok"; data: T }
  | { status: "needs_manual_entry"; confidence: 0; raw: unknown; error: string };

/** The one call the SDK makes; swapped out in tests so nothing here hits the network. */
export type GenerateJson = (params: {
  promptText: string;
  parts: unknown[];
  responseJsonSchema: unknown;
}) => Promise<string | undefined>;

export type GeminiClient = {
  extractMeal(photo: MediaInput): Promise<Extraction<MealExtraction>>;
  extractDevice(photo: MediaInput): Promise<Extraction<DeviceExtraction>>;
  extractLabs(doc: MediaInput): Promise<Extraction<LabExtraction>>;
  codeSymptoms(text: string): Promise<Extraction<SymptomCoding>>;
};

const MAX_ATTEMPTS = 2; // one try, one retry

/** Runs `generate`, validates against `schema`, retries once on failure, else falls back. */
async function extract<T>(
  generate: GenerateJson,
  schema: z.ZodType<T>,
  promptText: string,
  parts: unknown[],
): Promise<Extraction<T>> {
  const responseJsonSchema = z.toJSONSchema(schema);
  let lastRaw: unknown;
  let lastError = "no response";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let text: string | undefined;
    try {
      text = await generate({ promptText, parts, responseJsonSchema });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
    if (!text) {
      lastError = "empty response";
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      lastRaw = text;
      lastError = "response was not valid JSON";
      continue;
    }
    lastRaw = json;
    const parsed = schema.safeParse(json);
    if (parsed.success) return { status: "ok", data: parsed.data };
    lastError = parsed.error.message;
  }
  return { status: "needs_manual_entry", confidence: 0, raw: lastRaw, error: lastError };
}

const MEAL_PROMPT =
  "You are extracting structured nutrition data from a photo of a meal. Estimate the items, " +
  "calories (kcal), carbohydrates (g), protein (g), fat (g), fibre (g) and sodium (mg). " +
  "Return your confidence (0 to 1) in the estimate. Respond with JSON only, matching the schema.";

const DEVICE_PROMPT =
  `You are extracting readings from a photo of a home health device (blood pressure monitor, scale, ` +
  `fitness tracker screen, etc). Only report metrics you can actually read from this device, using ` +
  `exactly these metric keys and units: ${Object.entries(DEVICE_METRIC_UNITS)
    .map(([m, u]) => `${m} (${u})`)
    .join(", ")}. If a timestamp is visible on the screen, convert it to ISO 8601; otherwise omit it. ` +
  "Respond with JSON only, matching the schema.";

const LABS_PROMPT =
  `You are extracting results from a lab report (PDF or photo). For each result you can identify, ` +
  `map it to exactly one of these metric keys and convert the value to the fixed unit shown — do the ` +
  `unit conversion yourself, do not leave it in the original unit: ${Object.entries(LAB_METRIC_UNITS)
    .map(([m, u]) => `${m} (${u})`)
    .join(", ")}. Skip any result that is not one of these. Include the collection date (ISO 8601) if ` +
  "printed on the report, and the original lab name and reference range for traceability. " +
  "Respond with JSON only, matching the schema.";

const SYMPTOM_PROMPT =
  `You are coding a patient's free-text message into a fixed list of symptom codes. Only use these ` +
  `codes, each with the severity (1 mild to 3 severe) the message implies: ${Object.entries(SYMPTOMS)
    .map(([code, def]) => `${code} = ${def.label}`)
    .join("; ")}. Set redFlag to true if the message describes any of: ${Object.entries(SYMPTOMS)
    .filter(([, def]) => "redFlag" in def)
    .map(([, def]) => def.label)
    .join(", ")}. If nothing in the message matches a code, return an empty codes array. ` +
  "Respond with JSON only, matching the schema.";

/** Builds a client backed by the real Gemini API. `apiKey`/`model` default to the env vars. */
export function createGeminiClient(opts: { apiKey?: string; model?: string } = {}): GeminiClient {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  const model = opts.model ?? process.env.GEMINI_MODEL;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  if (!model) throw new Error("GEMINI_MODEL is not set");
  const ai = new GoogleGenAI({ apiKey });

  const generate: GenerateJson = async ({ promptText, parts, responseJsonSchema }) => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: promptText }, ...(parts as object[])] }],
      config: { responseMimeType: "application/json", responseJsonSchema },
    });
    return response.text;
  };

  return buildClient(generate);
}

/** Builds a client from an injected `generate` function; used directly in tests, no network. */
export function buildClient(generate: GenerateJson): GeminiClient {
  return {
    extractMeal: (photo) =>
      extract(generate, MealExtractionSchema, MEAL_PROMPT, [mediaPart(photo)]),
    extractDevice: (photo) =>
      extract(generate, DeviceExtractionSchema, DEVICE_PROMPT, [mediaPart(photo)]),
    extractLabs: (doc) =>
      extract(generate, LabExtractionSchema, LABS_PROMPT, [mediaPart(doc)]),
    codeSymptoms: (text) =>
      extract(generate, SymptomCodingSchema, `${SYMPTOM_PROMPT}\n\nMessage: ${JSON.stringify(text)}`, []),
  };
}

function mediaPart(media: MediaInput): unknown {
  return createPartFromBase64(media.base64, media.mimeType);
}
