import type { SourceId } from "./sources";
import { DAY_MS, DAYS_PER_YEAR } from "./types";

// Priority points ledger (RISK_ENGINE §6). Every layer that fires adds points with an engine-written reason;
// the list of contributions is the "why" panel. Point values and bands are starting values to calibrate
// against the seed. Nothing here comes from Gemini.

export type Layer = "threshold" | "score" | "trend" | "changepoint" | "cooccurrence" | "sleep" | "symptom" | "gap";
export type Severity = "monitor" | "review" | "urgent";

export type EvidencePoint = { metric: string; ts: string; value: number; unit: string };

export type Contribution = {
  layer: Layer;
  /** From POINTS below, never from Gemini. */
  points: number;
  /** One sentence built from an engine template. */
  reason: string;
  evidence: EvidencePoint[];
  sourceIds: SourceId[];
  /** The patient stopped logging, so this daily-series signal is older than it looks (RISK_ENGINE §6, gap layer). */
  stale?: true;
  /** A single abnormal result awaiting a repeat (DECISIONS 2026-10-17): floors the flag at monitor. */
  unconfirmed?: true;
  /** |slope per year| / threshold, for trend rows only: a unitless rate so flags.ts can rank patients across metrics (RISK_ENGINE §7). */
  normalizedSlope?: number;
};

/** Shown next to a flag whose only abnormal values are single, unrepeated results. */
export const UNCONFIRMED_LABEL = "unconfirmed, repeat test suggested";

export const POINTS = {
  threshold: { monitorRange: 2, diagnosticRange: 4 },
  score: {
    canrisk: { high: 2, very_high: 3 },
    fib4: { intermediate: 1, high: 4 },
    fliRuleIn: 2,
  },
  trend: {
    /** Gate passes and the line reaches the threshold within a year. */
    crossingWithinYear: 4,
    /** ... within the 3 year horizon. */
    crossingWithinHorizon: 2,
    /** Moving toward the threshold with no crossing in the horizon. */
    towardNoCrossing: 1,
  },
  changepoint: { adverse: 1, agreesWithTrend: 2 },
  /** Metabolic syndrome by number of criteria met. */
  cooccurrence: { 3: 3, 4: 4, 5: 4 } as Record<number, number>,
  sleep: { intermediate: 1, high: 2 },
  gap: 1,
  /** Per layer, per condition. */
  layerCap: 4,
} as const;

/** 0 to 2 no flag, 3 to 5 monitor, 6 to 9 review, 10 and above urgent. */
export const BANDS = { monitorFrom: 3, reviewFrom: 6, urgentFrom: 10 } as const;

export function severityFromPoints(points: number): Severity | null {
  if (points >= BANDS.urgentFrom) return "urgent";
  if (points >= BANDS.reviewFrom) return "review";
  if (points >= BANDS.monitorFrom) return "monitor";
  return null;
}

const SEVERITY_RANK: Record<Severity, number> = { monitor: 1, review: 2, urgent: 3 };

export const severityRank = (s: Severity | null): number => (s ? SEVERITY_RANK[s] : 0);

export function maxSeverity(a: Severity | null, b: Severity | null): Severity | null {
  return severityRank(a) >= severityRank(b) ? a : b;
}

export const totalPoints = (contributions: Contribution[]): number =>
  contributions.reduce((sum, c) => sum + c.points, 0);

/** Layers that can create a flag on their own. Changepoint and sleep only support one that already exists. */
const PRIMARY_LAYERS: ReadonlySet<Layer> = new Set(["threshold", "score", "trend", "cooccurrence", "symptom"]);

export const hasPrimary = (contributions: Contribution[]): boolean =>
  contributions.some((c) => PRIMARY_LAYERS.has(c.layer) && c.points > 0);

const LAYER_ORDER: Layer[] = ["threshold", "score", "trend", "cooccurrence", "symptom", "changepoint", "sleep", "gap"];

/** Ledger display order: by layer, then biggest first. */
export function orderLedger(contributions: Contribution[]): Contribution[] {
  return contributions
    .map((c, i) => ({ c, i }))
    .sort((a, b) => LAYER_ORDER.indexOf(a.c.layer) - LAYER_ORDER.indexOf(b.c.layer) || b.c.points - a.c.points || a.i - b.i)
    .map(({ c }) => c);
}

/**
 * Caps each layer at `cap` points so one noisy layer cannot dominate. A trimmed row stays in the ledger with
 * its reduced points and says so, so the rows still add up to the total.
 */
export function applyLayerCap(contributions: Contribution[], cap: number = POINTS.layerCap): Contribution[] {
  const used = new Map<Layer, number>();
  return orderLedger(contributions).map((c) => {
    const before = used.get(c.layer) ?? 0;
    const counted = Math.min(c.points, Math.max(0, cap - before));
    used.set(c.layer, before + counted);
    if (counted === c.points) return c;
    return { ...c, points: counted, reason: `${c.reason} Counted ${counted} of ${c.points} points (layer cap ${cap}).` };
  });
}

// ---- Reason text helpers (templates live next to the numbers they describe) -------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const isoTs = (ts: number): string => new Date(ts).toISOString();

/** "Sep 3", in UTC so the text is the same everywhere. */
export function monthDay(ts: number): string {
  const d = new Date(ts);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "12 days", "7 months", "2.0 years". */
export function duration(days: number): string {
  if (days < 45) return plural(Math.max(1, Math.round(days)), "day");
  if (days < 1.5 * DAYS_PER_YEAR) return `${Math.round(days / 30.44)} months`;
  return `${(days / DAYS_PER_YEAR).toFixed(1)} years`;
}

/** "5.4%", "7.2 mmol/L": a percent sign hugs the number, other units get a space. */
export const withUnit = (value: string, unit: string): string => (unit === "%" ? `${value}%` : `${value} ${unit}`);

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Trims trailing zeros: 2 -> "2", 0.30 -> "0.3", 5.4 -> "5.4". */
export function num(x: number, digits = 1): string {
  return String(Number(x.toFixed(digits)));
}

export const daysBetween = (from: number, to: number): number => (to - from) / DAY_MS;
