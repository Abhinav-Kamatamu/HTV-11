import type { ConditionLedger, Evaluation } from "./evaluate";
import { severityRank, type Contribution, type Layer, type Severity } from "./points";
import type { SourceId } from "./sources";
import type { Condition } from "./types";

// Flag objects (RISK_ENGINE §7): the ledgers in an Evaluation, turned into the shape the UI and the
// `flags` table use, plus the clinician-queue ranking. Pure; nothing here recomputes points.

export type FlagKind =
  | "threshold" | "trend" | "score" | "symptom_cluster" | "changepoint" | "cooccurrence" | "sleep" | "gap";

export type Flag = {
  patientId: string;
  condition: Condition;
  kind: FlagKind;
  severity: Severity;
  /** The top contributor's reason, engine-written. */
  title: string;
  points: number;
  contributions: Contribution[];
  /** Union of every contribution's evidence, deduplicated. */
  evidence: Contribution["evidence"];
  /** Same text as `title` (the rule that fired); kept as its own field to match the persisted Flag shape. */
  rule: string;
  /** Union of every contribution's sourceIds, deduplicated. */
  sourceIds: SourceId[];
  status: "new";
  /** ConditionLedger.label, e.g. "unconfirmed, repeat test suggested" (DECISIONS 2026-10-17). Not yet a
   * column on the `flags` table (src/db/schema.ts) — core needs to add one before persisting it. */
  label: string | null;
};

const KIND_BY_LAYER: Record<Layer, FlagKind> = {
  threshold: "threshold",
  trend: "trend",
  score: "score",
  symptom: "symptom_cluster",
  changepoint: "changepoint",
  cooccurrence: "cooccurrence",
  sleep: "sleep",
  gap: "gap",
};

/** Tie-break order when contributions share the top point value (relay/engine.md, T-024). */
const KIND_TIEBREAK: Layer[] = ["threshold", "trend", "score", "cooccurrence", "symptom", "sleep", "changepoint", "gap"];

/** Highest points first, then the tie-break order, then original position (stable). */
function pickTop(contributions: Contribution[]): Contribution {
  return contributions
    .map((c, i) => ({ c, i }))
    .sort((a, b) =>
      b.c.points - a.c.points ||
      KIND_TIEBREAK.indexOf(a.c.layer) - KIND_TIEBREAK.indexOf(b.c.layer) ||
      a.i - b.i,
    )[0].c;
}

function uniqueEvidence(evidence: Contribution["evidence"]): Contribution["evidence"] {
  const seen = new Set<string>();
  const out: Contribution["evidence"] = [];
  for (const e of evidence) {
    const key = `${e.metric}|${e.ts}|${e.value}|${e.unit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function toFlag(patientId: string, l: ConditionLedger & { severity: Severity }): Flag {
  const top = pickTop(l.contributions);
  return {
    patientId,
    condition: l.condition,
    kind: KIND_BY_LAYER[top.layer],
    severity: l.severity,
    title: top.reason,
    points: l.points,
    contributions: l.contributions,
    evidence: uniqueEvidence(l.contributions.flatMap((c) => c.evidence)),
    rule: top.reason,
    sourceIds: [...new Set(l.contributions.flatMap((c) => c.sourceIds))],
    status: "new",
    label: l.label,
  };
}

/** One Flag per condition ledger with a severity. Red flags are a patient-level alert, not a Flag (RISK_ENGINE §7). */
export function toFlags(evaluation: Evaluation): Flag[] {
  return evaluation.conditions
    .filter((l): l is ConditionLedger & { severity: Severity } => l.severity !== null)
    .map((l) => toFlag(evaluation.patientId, l));
}

// ---- Ranking ---------------------------------------------------------------------------------------

export type PatientFlags = { patientId: string; flags: Flag[] };

/** A patient whose only open flag is engagement (gap-only) never outranks one with a clinical flag. */
const isGapOnly = (flags: Flag[]): boolean => flags.length > 0 && flags.every((f) => f.condition === "engagement");

const maxFlagSeverity = (flags: Flag[]): Severity | null =>
  flags.reduce<Severity | null>((acc, f) => (severityRank(f.severity) > severityRank(acc) ? f.severity : acc), null);

const totalFlagPoints = (flags: Flag[]): number => flags.reduce((sum, f) => sum + f.points, 0);

const steepestNormalizedSlope = (flags: Flag[]): number =>
  Math.max(0, ...flags.flatMap((f) => f.contributions.map((c) => c.normalizedSlope ?? 0)));

/**
 * Clinician queue order (RISK_ENGINE §7): max severity, then total points across flags, then the steepest
 * normalized slope. A gap-only (engagement-only) patient sorts after any patient with a clinical flag,
 * whatever their severity/points say, since engagement alone is a monitor-band flag but not a clinical one.
 */
export function rankPatients(patients: PatientFlags[]): PatientFlags[] {
  return [...patients].sort((a, b) => {
    const gapA = isGapOnly(a.flags);
    const gapB = isGapOnly(b.flags);
    if (gapA !== gapB) return gapA ? 1 : -1;

    const sevDiff = severityRank(maxFlagSeverity(b.flags)) - severityRank(maxFlagSeverity(a.flags));
    if (sevDiff !== 0) return sevDiff;

    const ptsDiff = totalFlagPoints(b.flags) - totalFlagPoints(a.flags);
    if (ptsDiff !== 0) return ptsDiff;

    const slopeDiff = steepestNormalizedSlope(b.flags) - steepestNormalizedSlope(a.flags);
    if (slopeDiff !== 0) return slopeDiff;

    return a.patientId.localeCompare(b.patientId);
  });
}
