import { type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { listQueue } from "@/app/api/_lib/engine-db";
import { ok, withErrors } from "@/app/api/_lib/http";

// GET /api/clinician/patients?severity= (ARCHITECTURE.md): ranked queue read from persisted flags.
// Run POST /api/engine/run first to pick up new readings.

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const severity = request.nextUrl.searchParams.get("severity");
    const queue = await listQueue(getDb());
    const filtered = severity ? queue.filter((p) => p.severity === severity) : queue;
    return ok({ patients: filtered });
  });
}
