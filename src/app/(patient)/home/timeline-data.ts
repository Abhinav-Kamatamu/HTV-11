import type { getPatientSummary } from "@/app/api/_lib/engine-db";
import { isSymptomCode, SYMPTOMS } from "@/engine/symptoms";

// Builds the patient home timeline (T-060): the patient's own logged activity, newest first.
// Daily vitals (`source: "synthetic"`/`"intake"`) are background data for the engine, not something
// the patient "logged" today, so only device/manual readings join meals, symptom chats and lab
// reports here — that also keeps 90 days of seeded daily vitals from flooding the feed.

type Summary = Awaited<ReturnType<typeof getPatientSummary>>;

export type TimelineItem =
  | { kind: "meal"; id: string; ts: number; items: unknown[]; kcal: number | null; carbsG: number | null; proteinG: number | null; fatG: number | null; fibreG: number | null; sodiumMg: number | null; confidence: number }
  | { kind: "symptom"; id: string; ts: number; text: string; labels: string[]; redFlag: boolean }
  | { kind: "lab"; id: string; ts: number; values: { metric: string; value: number; unit: string }[] }
  | { kind: "reading"; id: string; ts: number; values: { metric: string; value: number; unit: string }[] };

const READING_SOURCES = new Set(["device_photo", "manual"]);

const METRIC_LABEL: Record<string, string> = {
  bp_systolic: "Systolic BP", bp_diastolic: "Diastolic BP", weight_kg: "Weight",
  resting_hr: "Heart rate", steps: "Steps", sleep_hours: "Sleep",
  hba1c: "HbA1c", fpg: "Fasting glucose", creatinine: "Creatinine", egfr: "eGFR", acr: "ACR",
  alt: "ALT", ast: "AST", ggt: "GGT", platelets: "Platelets", triglycerides: "Triglycerides",
  hdl: "HDL", waist_cm: "Waist", neck_cm: "Neck circumference",
};

export function metricLabel(metric: string): string {
  return METRIC_LABEL[metric] ?? metric;
}

export function buildTimeline(summary: Summary): TimelineItem[] {
  const meals: TimelineItem[] = summary.meals.map((m) => ({
    kind: "meal", id: m.id, ts: m.ts.getTime(), items: m.items,
    kcal: m.kcal, carbsG: m.carbsG, proteinG: m.proteinG, fatG: m.fatG, fibreG: m.fibreG,
    sodiumMg: m.sodiumMg, confidence: m.confidence,
  }));

  const symptoms: TimelineItem[] = summary.symptomLogs.map((s) => ({
    kind: "symptom", id: s.id, ts: s.ts.getTime(), text: s.text, redFlag: s.redFlag,
    // `codes` entries are either a plain code string (seed data) or `{code, severity}` (Gemini
    // extraction via /api/ingest/symptom) — same (string | SymptomEntry) shape engine/symptoms.ts's
    // own `entry()` normalizes. Rendering the raw object here crashed the page (React error #31).
    labels: (s.codes as (string | { code: string })[]).map((c) => {
      const code = typeof c === "string" ? c : c.code;
      return isSymptomCode(code) ? SYMPTOMS[code].label : code;
    }),
  }));

  const labs: TimelineItem[] = summary.labReports.map((l) => ({
    kind: "lab", id: l.id, ts: l.collectedAt.getTime(),
    values: Object.entries(l.extracted as Record<string, { value: number; unit: string }>)
      .map(([metric, v]) => ({ metric, value: v.value, unit: v.unit })),
  }));

  const readingGroups = new Map<number, { metric: string; value: number; unit: string }[]>();
  for (const o of summary.observations) {
    if (!READING_SOURCES.has(o.source)) continue;
    const ts = o.ts.getTime();
    const group = readingGroups.get(ts) ?? [];
    group.push({ metric: o.metric, value: o.value, unit: o.unit });
    readingGroups.set(ts, group);
  }
  const readings: TimelineItem[] = [...readingGroups.entries()].map(([ts, values]) => ({
    kind: "reading", id: `reading-${ts}`, ts, values,
  }));

  return [...meals, ...symptoms, ...labs, ...readings].sort((a, b) => b.ts - a.ts);
}
