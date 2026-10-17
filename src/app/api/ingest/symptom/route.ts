import { z } from "zod";
import { getDb } from "@/db/client";
import { symptomLogs } from "@/db/schema";
import { requirePatient, runEngineForPatient } from "@/app/api/_lib/engine-db";
import { getGeminiClient } from "@/app/api/_lib/gemini";
import { ok, parseJson, withErrors } from "@/app/api/_lib/http";
import { SYMPTOMS, type SymptomCode } from "@/engine/symptoms";

// POST /api/ingest/symptom (ARCHITECTURE.md): { patientId, text } -> symptom_log (+ red-flag response).
// Gemini only maps text to the fixed code list (RISK_ENGINE §5/§10); whether a code is a red flag is
// the engine's SYMPTOMS table, not Gemini's `redFlag` guess, so the final flag is the OR of both
// (CLAUDE.md §4: the risk engine decides).

const BodySchema = z.object({ patientId: z.string().min(1), text: z.string().min(1) });

const SEEK_CARE_NOW =
  "This may need urgent attention. Please seek care now (call 911 or go to your nearest emergency " +
  "department). Your care team has been notified.";

export async function POST(request: Request) {
  return withErrors(async () => {
    const { patientId, text } = await parseJson(request, BodySchema);
    const db = getDb();
    await requirePatient(db, patientId);
    const coding = await getGeminiClient().codeSymptoms(text);

    const now = new Date();
    if (coding.status === "needs_manual_entry") {
      const [log] = await db.insert(symptomLogs).values({ patientId, ts: now, text, codes: [], redFlag: false })
        .returning();
      return ok({ symptomLog: log, extraction: coding, redFlag: false, message: null }, { status: 202 });
    }

    const { data } = coding;
    const redFlag = data.redFlag || data.codes.some((c) => "redFlag" in SYMPTOMS[c.code as SymptomCode]);
    const [log] = await db.insert(symptomLogs).values({ patientId, ts: now, text, codes: data.codes, redFlag })
      .returning();

    const { flags } = await runEngineForPatient(db, patientId, now.getTime());
    return ok({ symptomLog: log, extraction: coding, flags, redFlag, message: redFlag ? SEEK_CARE_NOW : null });
  });
}
