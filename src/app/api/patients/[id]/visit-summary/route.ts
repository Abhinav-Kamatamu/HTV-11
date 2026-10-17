import { getDb } from "@/db/client";
import { getPatientSummary } from "@/app/api/_lib/engine-db";
import { getGeminiClient } from "@/app/api/_lib/gemini";
import { ok, withErrors } from "@/app/api/_lib/http";

// GET /api/patients/:id/visit-summary (T-044): Gemini bullet summary of a patient's open flags for
// appointment prep (SPEC.md §3.5). Cites only the sourceIds already on those flags (RISK_ENGINE §10) —
// never invents a score. Called on demand from the clinician UI, not on every page load, since each
// call is a real Gemini request.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const { id } = await params;
    const summary = await getPatientSummary(getDb(), id);
    const extraction = await getGeminiClient().visitSummary({
      patientName: summary.patient.name,
      // `summary.flags` carries the persisted status (new/validated) for the UI; the Gemini client's
      // `Flag` type is pre-persistence and always "new" — the prompt never reads status either way.
      flags: summary.flags.map((f) => ({ ...f, status: "new" as const })),
    });
    return ok(extraction);
  });
}
