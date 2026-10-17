import { getDb } from "@/db/client";
import { labReports, observations } from "@/db/schema";
import { requirePatient, runEngineForPatient } from "@/app/api/_lib/engine-db";
import { getGeminiClient } from "@/app/api/_lib/gemini";
import { ApiError, ok, withErrors } from "@/app/api/_lib/http";
import { readUploadedFile } from "@/app/api/_lib/uploads";

// POST /api/ingest/labs (ARCHITECTURE.md): multipart { patientId, doc } (pdf/photo) -> lab_report +
// observations. Gemini converts every result to the fixed SI unit (RISK_ENGINE §10/schemas.ts); it
// never decides a flag.

export async function POST(request: Request) {
  return withErrors(async () => {
    const formData = await request.formData();
    const patientId = formData.get("patientId");
    if (typeof patientId !== "string" || !patientId) throw new ApiError(400, "patientId is required");

    const db = getDb();
    await requirePatient(db, patientId);
    const upload = await readUploadedFile(formData, "doc");
    const extraction = await getGeminiClient().extractLabs({ base64: upload.base64, mimeType: upload.mimeType });

    const now = new Date();
    if (extraction.status === "needs_manual_entry") {
      const [report] = await db.insert(labReports).values({
        patientId, collectedAt: now, fileUrl: upload.storedPath, extracted: extraction,
      }).returning();
      return ok({ labReport: report, extraction }, { status: 202 });
    }

    const { data } = extraction;
    const collectedAt = data.results.find((r) => r.collectedAt)?.collectedAt;
    const reportDate = collectedAt ? new Date(collectedAt) : now;

    const [report] = await db.insert(labReports).values({
      patientId, collectedAt: reportDate, fileUrl: upload.storedPath, extracted: data,
    }).returning();

    const rows = data.results.length
      ? await db.insert(observations).values(
          data.results.map((r) => ({
            patientId, ts: r.collectedAt ? new Date(r.collectedAt) : reportDate,
            metric: r.metric, value: r.value, unit: r.unit, source: "lab" as const, confidence: data.confidence,
          })),
        ).returning()
      : [];

    const { flags } = await runEngineForPatient(db, patientId, reportDate.getTime());
    return ok({ labReport: report, observations: rows, extraction, flags });
  });
}
