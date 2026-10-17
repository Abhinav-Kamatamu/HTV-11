import type { SymptomLogInput } from "./symptoms";
import type { Pt, Sex } from "./types";
import type { Silence } from "./silence";

/** Everything the engine reads about one patient. Plain data, no database types, so tests can feed it the seed. */
export type PatientRecord = {
  patientId: string;
  sex: Sex;
  dobMs: number;
  now: number;
  /** intake.height_cm */
  heightCm: number | null;
  /** intake.medications; non-empty means "on treatment". */
  medications: string[];
  /** CANRISK questionnaire score (0 to 87) when the patient has completed it. */
  canriskScore: number | null;
  /** Observations by metric, oldest first. */
  obs: Record<string, Pt[]>;
  symptomLogs: SymptomLogInput[];
  /** From the heartbeat query (T-008). Undefined: derive it from the daily series. Null: known not silent. */
  silence?: Silence | null;
};

type Stamp = Date | number;
const ms = (t: Stamp): number => (typeof t === "number" ? t : t.getTime());

/** Row shapes fit both the Drizzle select models (database) and insert models (seed), whose columns are optional. */
export type RecordSource = {
  patient: { id: string; dob: string; sex: Sex; intake: Record<string, unknown> };
  observations: { ts: Stamp; metric: string; value: number }[];
  symptomLogs: { ts: Stamp; codes?: unknown[]; redFlag?: boolean }[];
};

export function buildRecord(src: RecordSource, now: number): PatientRecord {
  const obs: Record<string, Pt[]> = {};
  for (const o of src.observations) (obs[o.metric] ??= []).push({ ts: ms(o.ts), value: o.value });
  for (const series of Object.values(obs)) series.sort((a, b) => a.ts - b.ts);

  const { intake } = src.patient;
  const height = intake.height_cm;
  const meds = intake.medications;
  const canrisk = intake.canrisk_score;

  return {
    patientId: src.patient.id,
    sex: src.patient.sex,
    dobMs: Date.parse(src.patient.dob),
    now,
    heightCm: typeof height === "number" ? height : null,
    medications: Array.isArray(meds) ? meds.filter((m): m is string => typeof m === "string") : [],
    canriskScore: typeof canrisk === "number" ? canrisk : null,
    obs,
    symptomLogs: src.symptomLogs.map((l) => ({
      ts: ms(l.ts),
      codes: (l.codes ?? []).filter((c): c is SymptomLogInput["codes"][number] => typeof c === "string" || (typeof c === "object" && c !== null && "code" in c)),
      redFlag: l.redFlag ?? false,
    })),
    silence: undefined,
  };
}
