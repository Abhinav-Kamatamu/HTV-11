"use server";

import { getDb } from "@/db/client";
import { observations } from "@/db/schema";
import { requirePatient, runEngineForPatient } from "@/app/api/_lib/engine-db";

// Server action for T-064. No API route exists for this (relay/patient.md Gotchas), and this
// lane only owns `src/app/(patient)`, so it writes observations directly instead of adding a
// route under core's `src/app/api` — same `getDb`/engine-db pattern `home/page.tsx` already uses.
// Fixed form, no Gemini: three check-in observations share one `ts` so `evaluate.ts`'s
// `sleepCheckins()` can join them (RISK_ENGINE §4b).

const UNITS = {
  sleep_snoring: "0/1",
  sleep_tired: "0/1",
  sleep_observed_apnea: "0/1",
  sleep_hours: "h",
  neck_cm: "cm",
} as const;

export type SleepCheckinInput = {
  patientId: string;
  snoring: 0 | 1;
  tired: 0 | 1;
  observedApnea: 0 | 1;
  sleepHours: number | null;
  neckCm: number | null;
};

export async function submitSleepCheckin(
  input: SleepCheckinInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const db = getDb();
    await requirePatient(db, input.patientId);
    const ts = new Date();

    const rows: (typeof observations.$inferInsert)[] = [
      { patientId: input.patientId, ts, metric: "sleep_snoring", value: input.snoring, unit: UNITS.sleep_snoring, source: "manual" },
      { patientId: input.patientId, ts, metric: "sleep_tired", value: input.tired, unit: UNITS.sleep_tired, source: "manual" },
      { patientId: input.patientId, ts, metric: "sleep_observed_apnea", value: input.observedApnea, unit: UNITS.sleep_observed_apnea, source: "manual" },
    ];
    if (input.sleepHours !== null) {
      rows.push({ patientId: input.patientId, ts, metric: "sleep_hours", value: input.sleepHours, unit: UNITS.sleep_hours, source: "manual" });
    }
    if (input.neckCm !== null) {
      rows.push({ patientId: input.patientId, ts, metric: "neck_cm", value: input.neckCm, unit: UNITS.neck_cm, source: "manual" });
    }

    await db.insert(observations).values(rows);
    await runEngineForPatient(db, input.patientId, ts.getTime());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}
