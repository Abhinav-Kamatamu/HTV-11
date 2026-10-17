import { z } from "zod";
import { getDb } from "@/db/client";
import { patients } from "@/db/schema";
import { requirePatient, runEngineForPatient } from "@/app/api/_lib/engine-db";
import { ok, parseJson, withErrors } from "@/app/api/_lib/http";

// POST /api/engine/run (ARCHITECTURE.md): { patientId? } -> recompute flags. One patient for an ingest
// callback; no patientId for the demo's manual "re-run all" button.

const BodySchema = z.object({ patientId: z.string().min(1).optional() });

export async function POST(request: Request) {
  return withErrors(async () => {
    const { patientId } = await parseJson(request, BodySchema);
    const db = getDb();

    if (patientId) {
      await requirePatient(db, patientId);
      const { evaluation, flags } = await runEngineForPatient(db, patientId);
      return ok({ patientsRun: 1, evaluation, flags });
    }

    const all = await db.select({ id: patients.id }).from(patients);
    let flagsWritten = 0;
    for (const p of all) {
      const { flags } = await runEngineForPatient(db, p.id);
      flagsWritten += flags.length;
    }
    return ok({ patientsRun: all.length, flagsWritten });
  });
}
