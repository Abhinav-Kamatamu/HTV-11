import { DAY_MS, type Condition } from "./types";

// Symptom weighting (RISK_ENGINE §5). Gemini maps free text to codes from this fixed list with a severity of
// 1 to 3; it never decides importance. The weights, the decay and the red-flag list below do.

export type SymptomDef = {
  label: string;
  /** Base weight per condition cluster. */
  weights: Partial<Record<Condition, number>>;
  /** Bypasses scoring: the patient sees "seek care now" and the clinician is notified. */
  redFlag?: true;
};

export const SYMPTOMS = {
  thirst: { label: "Excessive thirst", weights: { t2d: 0.8 } },
  polyuria: { label: "Passing a lot of urine", weights: { t2d: 0.6 } },
  nocturia: { label: "Waking at night to pass urine", weights: { t2d: 0.4, ckd: 0.2 } },
  fatigue: { label: "Unusual tiredness", weights: { t2d: 0.3, ckd: 0.2 } },
  blurred_vision: { label: "Blurred vision", weights: { t2d: 0.5, htn: 0.2 } },
  weight_loss: { label: "Unintended weight loss", weights: { t2d: 0.4 } },
  slow_healing: { label: "Cuts or sores slow to heal", weights: { t2d: 0.4 } },
  foamy_urine: { label: "Foamy urine", weights: { ckd: 0.7 } },
  edema: { label: "Swollen ankles or face", weights: { ckd: 0.5, htn: 0.1 } },
  nausea: { label: "Nausea", weights: { ckd: 0.2, masld: 0.2 } },
  headache: { label: "Headache", weights: { htn: 0.2 } },
  dizziness: { label: "Dizziness", weights: { htn: 0.2 } },
  dyspnea: { label: "Shortness of breath", weights: { htn: 0.3, ckd: 0.2 } },
  ruq_discomfort: { label: "Discomfort under the right ribs", weights: { masld: 0.5 } },
  dark_urine: { label: "Dark urine", weights: { masld: 0.3 } },
  chest_pain: { label: "Chest pain or pressure", weights: {}, redFlag: true },
  stroke_signs: { label: "Face droop, arm weakness or speech trouble", weights: {}, redFlag: true },
  syncope: { label: "Fainting", weights: {}, redFlag: true },
  severe_dyspnea: { label: "Severe breathlessness at rest", weights: {}, redFlag: true },
  gi_bleeding: { label: "Vomiting blood or black stools", weights: {}, redFlag: true },
} as const satisfies Record<string, SymptomDef>;

export type SymptomCode = keyof typeof SYMPTOMS;
export const isSymptomCode = (code: string): code is SymptomCode => Object.hasOwn(SYMPTOMS, code);

const LABEL_TO_CODE = new Map<string, SymptomCode>(
  (Object.entries(SYMPTOMS) as [SymptomCode, SymptomDef][]).map(([code, def]) => [def.label.toLowerCase(), code]),
);

/**
 * Gemini's prompt lists each code as `code = label` (e.g. `thirst = Excessive thirst`) and is told
 * to return only the code, but live testing found it sometimes returns the label instead (e.g.
 * `"Excessive thirst"` for `thirst`) — a plausible, understandable response, just not the exact
 * token the schema requires, and real confidence/severity on the rest of the response showed it
 * had genuinely understood the text correctly. Rather than rely on prompt wording alone to get a
 * non-deterministic model to pick the right side of an `=` every time, normalize a label match back
 * to its code before validating, so this class of slip doesn't burn a retry or fall back to manual
 * entry on input the model clearly understood. Case-insensitive; returns the input unchanged if it
 * matches neither a code nor a label, so genuinely unrecognized content still correctly fails
 * `isSymptomCode` downstream.
 */
export function normalizeSymptomCode(input: string): string {
  if (isSymptomCode(input)) return input;
  return LABEL_TO_CODE.get(input.toLowerCase()) ?? input;
}

export const SYMPTOM_PARAMS = {
  /** Decay time constant in days: a report loses 63% of its weight every 21 days. */
  decayDays: 21,
  /** A cluster contributes at most this many points. */
  capPoints: 3,
  /** Severity assumed when a log carries codes only (the seed, and any extraction without severity). */
  defaultSeverity: 1,
  /** A red flag stays "active" for the clinician for this long. */
  redFlagActiveDays: 7,
} as const;

export type SymptomEntry = { code: string; severity?: 1 | 2 | 3 };
export type SymptomLogInput = {
  ts: number;
  codes: (string | SymptomEntry)[];
  /** Flag already raised upstream (symptom_logs.red_flag). Never ignored. */
  redFlag?: boolean;
};

const entry = (c: string | SymptomEntry): SymptomEntry => (typeof c === "string" ? { code: c } : c);
const roundHalf = (x: number) => Math.round(x * 2) / 2;

export type ClusterScore = {
  condition: Condition;
  /** Σ weight × severity × exp(−age_days / 21), uncapped. */
  raw: number;
  /** Capped at 3 and rounded to the nearest 0.5: the points the symptom layer earns. */
  points: number;
  /** Logs that contributed (weight > 0), newest first, for the reason text. */
  reports: { code: SymptomCode; ts: number; severity: number }[];
};

/** Decayed cluster score per condition. Logs in the future and unknown codes are ignored. */
export function clusterScores(logs: SymptomLogInput[], now: number): ClusterScore[] {
  const byCondition = new Map<Condition, ClusterScore>();
  for (const log of logs) {
    const ageDays = (now - log.ts) / DAY_MS;
    if (ageDays < 0) continue;
    const decay = Math.exp(-ageDays / SYMPTOM_PARAMS.decayDays);
    for (const raw of log.codes) {
      const { code, severity = SYMPTOM_PARAMS.defaultSeverity } = entry(raw);
      if (!isSymptomCode(code)) continue;
      const weights: Partial<Record<Condition, number>> = SYMPTOMS[code].weights;
      for (const [condition, weight] of Object.entries(weights) as [Condition, number][]) {
        const cluster = byCondition.get(condition) ?? { condition, raw: 0, points: 0, reports: [] };
        cluster.raw += weight * severity * decay;
        cluster.reports.push({ code, ts: log.ts, severity });
        byCondition.set(condition, cluster);
      }
    }
  }
  return [...byCondition.values()].map((c) => ({
    ...c,
    points: roundHalf(Math.min(c.raw, SYMPTOM_PARAMS.capPoints)),
    reports: c.reports.sort((a, b) => b.ts - a.ts),
  }));
}

export type RedFlag = { ts: number; code: SymptomCode | "unspecified" };

/** Red-flag reports inside the active window, newest first. A log with `redFlag: true` and no known code still counts. */
export function activeRedFlags(logs: SymptomLogInput[], now: number): RedFlag[] {
  const out: RedFlag[] = [];
  for (const log of logs) {
    const age = (now - log.ts) / DAY_MS;
    if (age < 0 || age > SYMPTOM_PARAMS.redFlagActiveDays) continue;
    const codes = log.codes.map((c) => entry(c).code).filter(isSymptomCode).filter((c) => "redFlag" in SYMPTOMS[c]);
    for (const code of codes) out.push({ ts: log.ts, code });
    if (log.redFlag && codes.length === 0) out.push({ ts: log.ts, code: "unspecified" });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

/** Times a code was reported in the last `days` days. */
export function reportCount(logs: SymptomLogInput[], codes: string[], now: number, days: number): number {
  return logs.filter((l) => {
    const age = (now - l.ts) / DAY_MS;
    return age >= 0 && age <= days && l.codes.some((c) => codes.includes(entry(c).code));
  }).length;
}
