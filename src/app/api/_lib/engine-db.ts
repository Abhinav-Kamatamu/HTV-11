import { and, desc, eq, gte, ne } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { flags, labReports, meals, messages, observations, patients, symptomLogs } from "@/db/schema";
import { evaluate } from "@/engine/evaluate";
import { rankPatients, toFlags, type Flag } from "@/engine/flags";
import { buildRecord, type PatientRecord, type RecordSource } from "@/engine/record";
import type { Silence } from "@/engine/silence";
import { activeRedFlags, SYMPTOM_PARAMS, type SymptomLogInput } from "@/engine/symptoms";
import { DAY_MS } from "@/engine/types";
import { listSilenceSql } from "@/db/silence";
import { ApiError, notFound } from "./http";

type Db = ReturnType<typeof getDb>;

export async function requirePatient(db: Db, patientId: string) {
  const [row] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId));
  if (!row) notFound("patient");
  return row;
}

/** Loads one patient's engine input from the database (RISK_ENGINE §7: "buildRecord builds the input
 * from database or seed rows"). `now` defaults to the current time; tests/demos can pin it. `silence`
 * overrides the engine's own pure fallback (`PatientRecord.silence`: undefined = derive it from the
 * daily series, null = known not silent) — pass the result of a batched `listSilenceSql` (T-008, `src/db/silence.ts`)
 * when running the engine for many patients at once, so each one doesn't re-derive it alone. */
export async function loadPatientRecord(
  db: Db, patientId: string, now = Date.now(), silence?: Silence | null,
): Promise<PatientRecord> {
  const [patient] = await db.select().from(patients).where(eq(patients.id, patientId));
  if (!patient) notFound("patient");
  const [obs, logs] = await Promise.all([
    db.select({ ts: observations.ts, metric: observations.metric, value: observations.value })
      .from(observations).where(eq(observations.patientId, patientId)),
    db.select({ ts: symptomLogs.ts, codes: symptomLogs.codes, redFlag: symptomLogs.redFlag })
      .from(symptomLogs).where(eq(symptomLogs.patientId, patientId)),
  ]);
  const source: RecordSource = { patient, observations: obs, symptomLogs: logs };
  const rec = buildRecord(source, now);
  return silence === undefined ? rec : { ...rec, silence };
}

/** Converts a persisted `flags` row back into the engine's `Flag` shape. Trusted (we wrote it), so the
 * jsonb columns are cast rather than re-validated. */
export function rowToFlag(row: typeof flags.$inferSelect): Flag {
  return {
    patientId: row.patientId,
    condition: row.condition,
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    points: row.points,
    contributions: row.contributions as Flag["contributions"],
    evidence: row.evidence as Flag["evidence"],
    rule: row.rule,
    sourceIds: row.sourceIds as Flag["sourceIds"],
    status: "new",
    label: row.label,
  };
}

/** Runs the engine for one patient and upserts the result: a row already open (`status = 'new'`) for a
 * condition is updated in place (same id, so the clinician UI doesn't churn); a condition with no open row
 * gets a new one. Conditions that stop firing are left for the clinician to dismiss — the engine never
 * auto-resolves a flag. `silence` is the same override `loadPatientRecord` takes (T-008). */
export async function runEngineForPatient(
  db: Db, patientId: string, now = Date.now(), silence?: Silence | null,
) {
  const rec = await loadPatientRecord(db, patientId, now, silence);
  const evaluation = evaluate(rec);
  const newFlags = toFlags(evaluation);

  const existing = await db.select().from(flags)
    .where(and(eq(flags.patientId, patientId), eq(flags.status, "new")));
  const byCondition = new Map(existing.map((f) => [f.condition, f]));

  const written: (typeof flags.$inferSelect)[] = [];
  for (const f of newFlags) {
    const prior = byCondition.get(f.condition);
    const values = {
      condition: f.condition, kind: f.kind, severity: f.severity, title: f.title, points: f.points,
      contributions: f.contributions, evidence: f.evidence, rule: f.rule, sourceIds: f.sourceIds,
      label: f.label,
    };
    if (prior) {
      const [row] = await db.update(flags).set(values).where(eq(flags.id, prior.id)).returning();
      written.push(row);
    } else {
      const [row] = await db.insert(flags).values({ patientId, ...values }).returning();
      written.push(row);
    }
  }
  return { evaluation, flags: written };
}

export type QueuePatient = {
  id: string; name: string; dob: string; sex: "female" | "male"; synthetic: boolean;
  severity: "monitor" | "review" | "urgent" | null;
  points: number;
  redFlag: boolean;
  topFlag: { condition: Flag["condition"]; kind: Flag["kind"]; title: string; points: number } | null;
  flagCount: number;
  silence: Silence | null;
};

/** Clinician queue (ARCHITECTURE.md `GET /api/clinician/patients`): ranks on persisted flags
 * (`rankPatients`, RISK_ENGINE §7), then pulls any patient with a recent red-flag symptom log to the
 * top regardless of points, mirroring `evaluate()`'s patientSeverity rule. Reads persisted state —
 * call `/api/engine/run` first to pick up new readings. */
export async function listQueue(db: Db, now = Date.now()): Promise<QueuePatient[]> {
  const redFlagSince = new Date(now - SYMPTOM_PARAMS.redFlagActiveDays * DAY_MS);

  const [allPatients, openFlags, recentLogs, silenceByPatient] = await Promise.all([
    db.select().from(patients),
    db.select().from(flags).where(ne(flags.status, "dismissed")),
    db.select({ patientId: symptomLogs.patientId, ts: symptomLogs.ts, codes: symptomLogs.codes, redFlag: symptomLogs.redFlag })
      .from(symptomLogs).where(and(eq(symptomLogs.redFlag, true), gte(symptomLogs.ts, redFlagSince))),
    listSilenceSql(db, now),
  ]);

  const flagsByPatient = new Map<string, Flag[]>();
  for (const p of allPatients) flagsByPatient.set(p.id, []);
  for (const row of openFlags) flagsByPatient.get(row.patientId)?.push(rowToFlag(row));

  const redFlagPatients = new Set<string>();
  const byPatientLogs = new Map<string, typeof recentLogs>();
  for (const log of recentLogs) {
    const arr = byPatientLogs.get(log.patientId) ?? [];
    arr.push(log);
    byPatientLogs.set(log.patientId, arr);
  }
  for (const [patientId, logs] of byPatientLogs) {
    const input: SymptomLogInput[] = logs.map((l) => ({
      ts: l.ts.getTime(), codes: (l.codes as SymptomLogInput["codes"]) ?? [], redFlag: l.redFlag,
    }));
    if (activeRedFlags(input, now).length > 0) redFlagPatients.add(patientId);
  }

  const ranked = rankPatients([...flagsByPatient.entries()].map(([patientId, fl]) => ({ patientId, flags: fl })));
  const ordered = [
    ...ranked.filter((pf) => redFlagPatients.has(pf.patientId)),
    ...ranked.filter((pf) => !redFlagPatients.has(pf.patientId)),
  ];

  const byId = new Map(allPatients.map((p) => [p.id, p]));
  return ordered.map(({ patientId, flags: fl }) => {
    const p = byId.get(patientId)!;
    const isRedFlag = redFlagPatients.has(patientId);
    const top = [...fl].sort((a, b) => b.points - a.points)[0] ?? null;
    const sevRank = { monitor: 1, review: 2, urgent: 3 } as const;
    const maxSev = fl.reduce<null | "monitor" | "review" | "urgent">(
      (acc, f) => (!acc || sevRank[f.severity] > sevRank[acc] ? f.severity : acc), null,
    );
    return {
      id: p.id, name: p.name, dob: p.dob, sex: p.sex, synthetic: p.synthetic,
      severity: isRedFlag ? "urgent" : maxSev,
      points: fl.reduce((sum, f) => sum + f.points, 0),
      redFlag: isRedFlag,
      topFlag: top ? { condition: top.condition, kind: top.kind, title: top.title, points: top.points } : null,
      flagCount: fl.length,
      silence: silenceByPatient.get(patientId) ?? null,
    };
  });
}

/** CLAUDE.md §4: only a validated flag can trigger a patient message. */
export async function createMessageForFlag(db: Db, flagId: string, body: string) {
  const [flag] = await db.select().from(flags).where(eq(flags.id, flagId));
  if (!flag) notFound("flag");
  if (flag.status !== "validated") throw new ApiError(409, "flag must be validated before it can message the patient");
  const [row] = await db.insert(messages).values({ patientId: flag.patientId, flagId, body }).returning();
  return row;
}

export async function listMessages(db: Db, patientId: string) {
  return db.select().from(messages).where(eq(messages.patientId, patientId)).orderBy(desc(messages.ts));
}

const OBSERVATIONS_LIMIT = 2000;

/** `GET /api/patients/:id/summary`: patient, open flags (their `contributions`/`evidence` already carry
 * the trend math — see RISK_ENGINE §6/§7), and recent logs/readings for the clinician charts (T-042/046). */
export async function getPatientSummary(db: Db, patientId: string) {
  const [patient] = await db.select().from(patients).where(eq(patients.id, patientId));
  if (!patient) notFound("patient");
  const [openFlags, recentMeals, recentLogs, recentLabs, recentObs] = await Promise.all([
    db.select().from(flags).where(and(eq(flags.patientId, patientId), ne(flags.status, "dismissed")))
      .orderBy(desc(flags.createdAt)),
    db.select().from(meals).where(eq(meals.patientId, patientId)).orderBy(desc(meals.ts)).limit(20),
    db.select().from(symptomLogs).where(eq(symptomLogs.patientId, patientId)).orderBy(desc(symptomLogs.ts)).limit(50),
    db.select().from(labReports).where(eq(labReports.patientId, patientId)).orderBy(desc(labReports.collectedAt)).limit(20),
    db.select().from(observations).where(eq(observations.patientId, patientId)).orderBy(desc(observations.ts))
      .limit(OBSERVATIONS_LIMIT),
  ]);
  return {
    patient,
    // rowToFlag's `status` is always the engine's own pre-persistence literal ("new"); override it with
    // the real column so callers can tell a validated flag from a fresh one (T-043 why panel).
    flags: openFlags.map((row) => ({ id: row.id, createdAt: row.createdAt, ...rowToFlag(row), status: row.status })),
    meals: recentMeals,
    symptomLogs: recentLogs,
    labReports: recentLabs,
    observations: recentObs,
  };
}

/** `POST /api/flags/:id/validate`: a clinician confirms the flag fired correctly. `note` is clinical
 * reasoning for the record; the patient message (if any) is created separately via `createMessageForFlag`
 * once this has set `status = "validated"`. */
export async function validateFlag(db: Db, flagId: string, note: string | undefined) {
  const [row] = await db.update(flags)
    .set({ status: "validated", clinicianNote: note ?? null, resolvedAt: new Date() })
    .where(eq(flags.id, flagId)).returning();
  if (!row) notFound("flag");
  return row;
}

/** `POST /api/flags/:id/dismiss`: the clinician decided the flag was wrong or not actionable. */
export async function dismissFlag(db: Db, flagId: string, reason: string | undefined) {
  const [row] = await db.update(flags)
    .set({ status: "dismissed", clinicianNote: reason ?? null, resolvedAt: new Date() })
    .where(eq(flags.id, flagId)).returning();
  if (!row) notFound("flag");
  return row;
}
