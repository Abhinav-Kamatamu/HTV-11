import { z } from "zod";
import { getDb } from "@/db/client";
import { createMessageForFlag, validateFlag } from "@/app/api/_lib/engine-db";
import { ok, parseJson, withErrors } from "@/app/api/_lib/http";

// POST /api/flags/:id/validate { note, message } (ARCHITECTURE.md). CLAUDE.md §4: the patient never
// gets a risk alert directly from the AI — a message is only created once the clinician validates here.

const BodySchema = z.object({ note: z.string().optional(), message: z.string().min(1).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const { id } = await params;
    const { note, message } = await parseJson(request, BodySchema);
    const db = getDb();
    const flag = await validateFlag(db, id, note);
    const createdMessage = message ? await createMessageForFlag(db, id, message) : null;
    return ok({ flag, message: createdMessage });
  });
}
