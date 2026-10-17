import { z } from "zod";
import { getDb } from "@/db/client";
import { dismissFlag } from "@/app/api/_lib/engine-db";
import { ok, parseJson, withErrors } from "@/app/api/_lib/http";

// POST /api/flags/:id/dismiss { reason } (ARCHITECTURE.md).

const BodySchema = z.object({ reason: z.string().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const { id } = await params;
    const { reason } = await parseJson(request, BodySchema);
    const flag = await dismissFlag(getDb(), id, reason);
    return ok({ flag });
  });
}
