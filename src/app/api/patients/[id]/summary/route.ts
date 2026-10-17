import { getDb } from "@/db/client";
import { getPatientSummary } from "@/app/api/_lib/engine-db";
import { ok, withErrors } from "@/app/api/_lib/http";

// GET /api/patients/:id/summary (ARCHITECTURE.md): patient, flags, recent logs.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const { id } = await params;
    const summary = await getPatientSummary(getDb(), id);
    return ok(summary);
  });
}
