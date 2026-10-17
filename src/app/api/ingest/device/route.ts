import { getDb } from "@/db/client";
import { observations } from "@/db/schema";
import { requirePatient, runEngineForPatient } from "@/app/api/_lib/engine-db";
import { getGeminiClient } from "@/app/api/_lib/gemini";
import { ApiError, ok, withErrors } from "@/app/api/_lib/http";
import { readUploadedFile } from "@/app/api/_lib/uploads";

// POST /api/ingest/device (ARCHITECTURE.md): multipart { patientId, photo } -> observations.
// Gemini reads the readings off the device screen (RISK_ENGINE §10); it never decides a flag.

export async function POST(request: Request) {
  return withErrors(async () => {
    const formData = await request.formData();
    const patientId = formData.get("patientId");
    if (typeof patientId !== "string" || !patientId) throw new ApiError(400, "patientId is required");

    const db = getDb();
    await requirePatient(db, patientId);
    const upload = await readUploadedFile(formData, "photo");
    const extraction = await getGeminiClient().extractDevice({ base64: upload.base64, mimeType: upload.mimeType });

    if (extraction.status === "needs_manual_entry") return ok({ extraction }, { status: 202 });

    const { data } = extraction;
    const ts = data.timestamp ? new Date(data.timestamp) : new Date();
    const rows = await db.insert(observations).values(
      data.readings.map((r) => ({
        patientId, ts, metric: r.metric, value: r.value, unit: r.unit, source: "device_photo" as const,
        confidence: data.confidence,
      })),
    ).returning();

    const { flags } = await runEngineForPatient(db, patientId, ts.getTime());
    return ok({ observations: rows, extraction, flags });
  });
}
