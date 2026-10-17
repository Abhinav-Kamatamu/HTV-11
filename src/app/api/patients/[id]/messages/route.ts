import { getDb } from "@/db/client";
import { listMessages, requirePatient } from "@/app/api/_lib/engine-db";
import { ok, withErrors } from "@/app/api/_lib/http";

// GET /api/patients/:id/messages (ARCHITECTURE.md).

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const { id } = await params;
    const db = getDb();
    await requirePatient(db, id);
    const messages = await listMessages(db, id);
    return ok({ messages });
  });
}
