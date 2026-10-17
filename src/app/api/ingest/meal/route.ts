import { getDb } from "@/db/client";
import { meals, observations } from "@/db/schema";
import { requirePatient, runEngineForPatient } from "@/app/api/_lib/engine-db";
import { getGeminiClient } from "@/app/api/_lib/gemini";
import { ApiError, ok, withErrors } from "@/app/api/_lib/http";
import { readUploadedFile } from "@/app/api/_lib/uploads";

// POST /api/ingest/meal (ARCHITECTURE.md): multipart { patientId, photo } -> meal + observations.
// Gemini only estimates the macros (RISK_ENGINE §10); nothing here scores a flag — the engine run
// at the end does that from the observations just written.

const MACRO_UNITS: Record<string, string> = {
  kcal: "kcal", carbs_g: "g", protein_g: "g", fat_g: "g", fibre_g: "g", sodium_mg: "mg",
};

export async function POST(request: Request) {
  return withErrors(async () => {
    const formData = await request.formData();
    const patientId = formData.get("patientId");
    if (typeof patientId !== "string" || !patientId) throw new ApiError(400, "patientId is required");

    const db = getDb();
    await requirePatient(db, patientId);
    const upload = await readUploadedFile(formData, "photo");
    const extraction = await getGeminiClient().extractMeal({ base64: upload.base64, mimeType: upload.mimeType });

    const now = new Date();
    if (extraction.status === "needs_manual_entry") {
      const [meal] = await db.insert(meals).values({
        patientId, ts: now, photoUrl: upload.storedPath, items: [], confidence: 0,
      }).returning();
      return ok({ meal, extraction }, { status: 202 });
    }

    const { data } = extraction;
    const [meal] = await db.insert(meals).values({
      patientId, ts: now, photoUrl: upload.storedPath, items: data.items,
      kcal: data.kcal, carbsG: data.carbsG, proteinG: data.proteinG, fatG: data.fatG,
      fibreG: data.fibreG, sodiumMg: data.sodiumMg, confidence: data.confidence,
    }).returning();

    const macros: [string, number][] = [
      ["kcal", data.kcal], ["carbs_g", data.carbsG], ["protein_g", data.proteinG],
      ["fat_g", data.fatG], ["fibre_g", data.fibreG], ["sodium_mg", data.sodiumMg],
    ];
    await db.insert(observations).values(
      macros.map(([metric, value]) => ({
        patientId, ts: now, metric, value, unit: MACRO_UNITS[metric], source: "meal_photo" as const,
        confidence: data.confidence,
      })),
    );

    const { flags } = await runEngineForPatient(db, patientId, now.getTime());
    return ok({ meal, extraction, flags });
  });
}
