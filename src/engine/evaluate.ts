import { detectChangePoints, type ChangePoint } from "./changepoint";
import { evaluateMets, type MetsResult } from "./cooccurrence";
import { isRapidEgfrDecline, labCrossing, labTrend } from "./labtrend";
import {
  applyLayerCap, daysBetween, duration, hasPrimary, isoTs, maxSeverity, monthDay, num, plural, POINTS, severityFromPoints,
  severityRank, totalPoints, UNCONFIRMED_LABEL, withUnit, type Contribution, type EvidencePoint, type Severity,
} from "./points";
import type { PatientRecord } from "./record";
import { bmi, canriskBand, fib4, fib4Band, fli, fliBand, homeBpAverage, homeBpHigh, pairBp, type BpAverage } from "./scores";
import { detectSilence, HEARTBEAT_METRICS, type Silence } from "./silence";
import { THRESHOLDS, type SourceId } from "./sources";
import { evaluateStopBang, type SleepCheckin, type StopBangResult } from "./stopbang";
import { activeRedFlags, clusterScores, SYMPTOMS, type ClusterScore, type RedFlag } from "./symptoms";
import { vitalsTrend } from "./trends";
import { DAY_MS, DAYS_PER_YEAR, type Condition, type Pt } from "./types";

// Orchestrator (RISK_ENGINE §6): a PatientRecord in, one points ledger per condition out. T-024 turns the
// ledgers into Flag objects and ranks them. Pure and deterministic; Gemini never touches a number here.

export type SeverityBasis =
  | "points" // the bands alone
  | "diagnostic_floor" // a sustained diagnostic range sets at least review
  | "rapid_decline_floor" // eGFR falling faster than 5/yr (KDIGO 2012) sets at least review
  | "unconfirmed_floor" // a single abnormal result sets at least monitor, label "unconfirmed, repeat test suggested"
  | "multiple_diagnostic" // two or more conditions in a diagnostic range set urgent
  | "osa_screen" // STOP-Bang high fires monitor regardless of points
  | "gap_only"; // an engagement flag is monitor

export type ConditionLedger = {
  condition: Condition;
  /** After the per-layer cap; the rows add up to `points`. */
  contributions: Contribution[];
  points: number;
  /** Null means no flag (below the monitor band and no floor). */
  severity: Severity | null;
  basis: SeverityBasis;
  /** A sustained value in a guideline diagnostic range (t2d, ckd, htn only). Screens are never diagnostic. */
  diagnostic: boolean;
  /** UNCONFIRMED_LABEL when the abnormal values are single results awaiting a repeat and nothing is diagnostic. */
  label: string | null;
};

export type Evaluation = {
  patientId: string;
  now: number;
  conditions: ConditionLedger[];
  /** Red-flag symptoms reported in the last 7 days. The patient is urgent whatever the points say. */
  redFlags: RedFlag[];
  /** Highest severity across conditions, or urgent when a red flag is active. */
  patientSeverity: Severity | null;
  /** Set when the patient stopped logging; their daily-series trends are marked stale. */
  silence: Silence | null;
  stopBang: StopBangResult;
  mets: MetsResult;
};

const UNIT: Record<string, string> = {
  hba1c: "%", fpg: "mmol/L", egfr: "mL/min/1.73m²", acr: "mg/mmol", bp_systolic: "mmHg", bp_diastolic: "mmHg",
  weight_kg: "kg", triglycerides: "mmol/L", waist_cm: "cm", hdl: "mmol/L", ggt: "U/L", alt: "U/L", ast: "U/L",
  platelets: "10^9/L",
};

const ev = (metric: string, p: Pt): EvidencePoint => ({ metric, ts: isoTs(p.ts), value: p.value, unit: UNIT[metric] ?? "" });
const contribution = (
  layer: Contribution["layer"], points: number, reason: string, evidence: EvidencePoint[], sourceIds: SourceId[],
): Contribution => ({ layer, points, reason, evidence, sourceIds });

const latest = (pts: Pt[] | undefined): Pt | null => (pts && pts.length ? pts.reduce((a, b) => (b.ts >= a.ts ? b : a)) : null);
const lastN = (pts: Pt[], n: number): Pt[] => pts.slice(-n);

// ---- Shared context, computed once per patient -------------------------------------------------

type Ctx = {
  rec: PatientRecord;
  ageYears: number;
  series: (metric: string) => Pt[];
  bpAvg: BpAverage | null;
  bpWindow: Pt[]; // systolic readings in the 30 day averaging window, for evidence
  stopBang: StopBangResult;
  mets: MetsResult;
  clusters: ClusterScore[];
  changePoints: Record<string, ChangePoint[]>;
};

const CHANGEPOINT_METRICS = ["bp_systolic", "bp_diastolic", "weight_kg"];

function sleepCheckins(rec: PatientRecord): SleepCheckin[] {
  const dia = new Map((rec.obs.sleep_tired ?? []).map((p) => [p.ts, p.value]));
  const apnea = new Map((rec.obs.sleep_observed_apnea ?? []).map((p) => [p.ts, p.value]));
  const bit = (v: number | undefined): 0 | 1 | null => (v === 0 || v === 1 ? v : null);
  return (rec.obs.sleep_snoring ?? []).flatMap((s) => {
    const snoring = bit(s.value);
    const tired = bit(dia.get(s.ts));
    const observedApnea = bit(apnea.get(s.ts));
    return snoring !== null && tired !== null && observedApnea !== null ? [{ ts: s.ts, snoring, tired, observedApnea }] : [];
  });
}

function buildCtx(rec: PatientRecord): Ctx {
  const series = (metric: string) => rec.obs[metric] ?? [];
  const readings = pairBp(series("bp_systolic"), series("bp_diastolic"));
  const bpAvg = homeBpAverage(readings, rec.now);
  const onTreatment = rec.medications.length > 0;
  const changePoints: Record<string, ChangePoint[]> = {};
  for (const m of CHANGEPOINT_METRICS) changePoints[m] = detectChangePoints(series(m));
  return {
    rec,
    ageYears: (rec.now - rec.dobMs) / (DAYS_PER_YEAR * DAY_MS),
    series,
    bpAvg,
    bpWindow: series("bp_systolic").filter((p) => p.ts <= rec.now && p.ts > rec.now - 30 * DAY_MS),
    stopBang: evaluateStopBang({
      sex: rec.sex, dobMs: rec.dobMs, now: rec.now, weight: series("weight_kg"), heightCm: rec.heightCm,
      neckCm: series("neck_cm"), onTreatment, homeBp: bpAvg, checkins: sleepCheckins(rec),
    }),
    mets: evaluateMets({
      sex: rec.sex, onTreatment, now: rec.now, waist: series("waist_cm"), triglycerides: series("triglycerides"),
      hdl: series("hdl"), fpg: series("fpg"), homeBp: bpAvg,
    }),
    clusters: clusterScores(rec.symptomLogs, rec.now),
    changePoints,
  };
}

// ---- Layer builders -----------------------------------------------------------------------------

type Range = { metric: string; label: string; unit: string; monitorFrom: number; diagnosticFrom: number; source: SourceId };

/** t2d: one result is enough for the diagnostic range (DECISIONS 06:00). Returns the contribution and whether it is diagnostic. */
function t2dThreshold(ctx: Ctx): { contributions: Contribution[]; diagnostic: boolean } {
  const ranges: Range[] = [
    { metric: "hba1c", label: "HbA1c", unit: "%", monitorFrom: THRESHOLDS.hba1c.atRiskFrom, diagnosticFrom: THRESHOLDS.hba1c.diabetesFrom, source: THRESHOLDS.hba1c.source },
    { metric: "fpg", label: "Fasting glucose", unit: "mmol/L", monitorFrom: THRESHOLDS.fpg.atRiskFrom, diagnosticFrom: THRESHOLDS.fpg.diabetesFrom, source: THRESHOLDS.fpg.source },
  ];
  const contributions: Contribution[] = [];
  let diagnostic = false;
  for (const r of ranges) {
    const p = latest(ctx.series(r.metric));
    if (!p || p.value < r.monitorFrom) continue;
    const isDiagnostic = p.value >= r.diagnosticFrom;
    diagnostic ||= isDiagnostic;
    const row = contribution(
      "threshold",
      isDiagnostic ? POINTS.threshold.diagnosticRange : POINTS.threshold.monitorRange,
      isDiagnostic
        ? `${r.label} ${withUnit(num(p.value, 2), r.unit)} on ${monthDay(p.ts)} is in the diabetes range (${r.diagnosticFrom} or above).`
        : `${r.label} ${withUnit(num(p.value, 2), r.unit)} on ${monthDay(p.ts)} is in the at-risk range (${r.monitorFrom} to below ${r.diagnosticFrom}); ${UNCONFIRMED_LABEL}.`,
      [ev(r.metric, p)],
      [r.source],
    );
    contributions.push(isDiagnostic ? row : { ...row, unconfirmed: true });
  }
  return { contributions, diagnostic };
}

/**
 * ckd: the latest result plus an earlier one at least 90 days before it (KDIGO chronicity). Both in range is
 * sustained (diagnostic); the latest alone is the monitor range until it is confirmed.
 */
function ckdThreshold(ctx: Ctx): { contributions: Contribution[]; diagnostic: boolean } {
  const chronicityMs = THRESHOLDS.ckd.chronicityMonths * 30 * DAY_MS;
  const checks = [
    { metric: "egfr", label: "eGFR", unit: "mL/min/1.73m²", inRange: (v: number) => v < THRESHOLDS.ckd.egfrCkdBelow, rule: `below ${THRESHOLDS.ckd.egfrCkdBelow}` },
    { metric: "acr", label: "Urine ACR", unit: "mg/mmol", inRange: (v: number) => v >= THRESHOLDS.ckd.acrA2From, rule: `${THRESHOLDS.ckd.acrA2From} or above` },
  ];
  const contributions: Contribution[] = [];
  let diagnostic = false;
  for (const c of checks) {
    const pts = ctx.series(c.metric);
    const last = latest(pts);
    if (!last || !c.inRange(last.value)) continue;
    const earlier = latest(pts.filter((p) => p.ts <= last.ts - chronicityMs));
    const sustained = earlier !== null && c.inRange(earlier.value);
    diagnostic ||= sustained;
    const row = contribution(
      "threshold",
      sustained ? POINTS.threshold.diagnosticRange : POINTS.threshold.monitorRange,
      sustained
        ? `${c.label} ${num(earlier.value)} on ${monthDay(earlier.ts)} and ${num(last.value)} on ${monthDay(last.ts)} are both ${c.rule} ${c.unit}, more than 3 months apart (CKD range).`
        : `${c.label} ${num(last.value)} ${c.unit} on ${monthDay(last.ts)} is ${c.rule}; ${UNCONFIRMED_LABEL} (a repeat at least 3 months later would confirm CKD).`,
      sustained ? [ev(c.metric, earlier), ev(c.metric, last)] : [ev(c.metric, last)],
      [THRESHOLDS.ckd.source],
    );
    contributions.push(sustained ? row : { ...row, unconfirmed: true });
  }
  return { contributions, diagnostic };
}

function htnThreshold(ctx: Ctx): { contributions: Contribution[]; diagnostic: boolean } {
  const avg = ctx.bpAvg;
  if (!avg || !homeBpHigh(avg)) return { contributions: [], diagnostic: false };
  const last = latest(ctx.bpWindow);
  return {
    diagnostic: true,
    contributions: [contribution(
      "threshold",
      POINTS.threshold.diagnosticRange,
      `Home BP averaged ${Math.round(avg.systolic)}/${Math.round(avg.diastolic)} mmHg over ${avg.days} days (${avg.n} readings), at or above ${THRESHOLDS.homeBp.systolic}/${THRESHOLDS.homeBp.diastolic}.`,
      last ? [{ metric: "bp_systolic", ts: isoTs(last.ts), value: Math.round(avg.systolic), unit: "mmHg" }] : [],
      [THRESHOLDS.homeBp.source],
    )],
  };
}

function canriskScore(ctx: Ctx): Contribution[] {
  const score = ctx.rec.canriskScore;
  if (score === null) return [];
  const band = canriskBand(score);
  if (band === "low" || band === "moderate") return [];
  return [contribution(
    "score",
    band === "high" ? POINTS.score.canrisk.high : POINTS.score.canrisk.very_high,
    `CANRISK score ${score} is in the ${band === "high" ? "high" : "very high"} band.`,
    [],
    [THRESHOLDS.canrisk.source],
  )];
}

function masldScores(ctx: Ctx): Contribution[] {
  const out: Contribution[] = [];
  const ast = latest(ctx.series("ast"));
  const alt = latest(ctx.series("alt"));
  const platelets = latest(ctx.series("platelets"));
  if (ast && alt && platelets) {
    const value = fib4({ age: ctx.ageYears, ast: ast.value, alt: alt.value, platelets: platelets.value });
    const band = fib4Band(value, ctx.ageYears);
    if (band !== "low") {
      out.push(contribution(
        "score",
        POINTS.score.fib4[band],
        `FIB-4 is ${num(value, 2)} (${band} fibrosis risk) from AST ${num(ast.value, 0)}, ALT ${num(alt.value, 0)} and platelets ${num(platelets.value, 0)}.`,
        [ev("ast", ast), ev("alt", alt), ev("platelets", platelets)],
        [THRESHOLDS.fib4.source],
      ));
    }
  }
  const tg = latest(ctx.series("triglycerides"));
  const ggt = latest(ctx.series("ggt"));
  const waist = latest(ctx.series("waist_cm"));
  const weight = latest(ctx.series("weight_kg"));
  if (tg && ggt && waist && weight && ctx.rec.heightCm !== null) {
    const value = fli({ triglyceridesMmolL: tg.value, bmi: bmi(weight.value, ctx.rec.heightCm), ggt: ggt.value, waistCm: waist.value });
    if (fliBand(value) === "rule_in") {
      out.push(contribution(
        "score",
        POINTS.score.fliRuleIn,
        `Fatty Liver Index is ${Math.round(value)} (${THRESHOLDS.fli.ruleInFrom} or above suggests steatosis) from triglycerides ${num(tg.value)}, GGT ${num(ggt.value, 0)}, waist ${num(waist.value, 0)} cm and BMI.`,
        [ev("triglycerides", tg), ev("ggt", ggt), ev("waist_cm", waist)],
        [THRESHOLDS.fli.source],
      ));
    }
  }
  return out;
}

type LabTrendSpec = {
  metric: string;
  label: string;
  unit: string;
  threshold: number;
  line: string;
  toward: "up" | "down";
  source: SourceId;
};

const LAB_TRENDS: Record<"t2d" | "ckd", LabTrendSpec[]> = {
  t2d: [
    { metric: "hba1c", label: "HbA1c", unit: "%", threshold: THRESHOLDS.hba1c.prediabetesFrom, line: "prediabetes line", toward: "up", source: THRESHOLDS.hba1c.source },
    { metric: "fpg", label: "Fasting glucose", unit: "mmol/L", threshold: THRESHOLDS.fpg.prediabetesFrom, line: "prediabetes line", toward: "up", source: THRESHOLDS.fpg.source },
  ],
  ckd: [
    { metric: "egfr", label: "eGFR", unit: "mL/min/1.73m²", threshold: THRESHOLDS.ckd.egfrCkdBelow, line: "CKD line", toward: "down", source: THRESHOLDS.ckd.source },
    { metric: "acr", label: "Urine ACR", unit: "mg/mmol", threshold: THRESHOLDS.ckd.acrA2From, line: "A2 line", toward: "up", source: THRESHOLDS.ckd.source },
  ],
};

function trendPoints(days: number | null): number {
  if (days === null) return POINTS.trend.towardNoCrossing;
  return days <= DAYS_PER_YEAR ? POINTS.trend.crossingWithinYear : POINTS.trend.crossingWithinHorizon;
}

/** Only metrics with a guideline threshold get a trend (DECISIONS 06:00), and only while still on the near side of it. */
function labTrends(ctx: Ctx, specs: LabTrendSpec[]): Contribution[] {
  const out: Contribution[] = [];
  for (const s of specs) {
    const pts = ctx.series(s.metric);
    const last = latest(pts);
    const t = labTrend(pts);
    if (!last || !t?.passes || t.direction !== s.toward) continue;
    if (s.toward === "up" ? last.value >= s.threshold : last.value <= s.threshold) continue;

    const crossing = labCrossing(t, s.threshold);
    const slope = `${s.toward === "up" ? "rising" : "falling"} ${withUnit(num(Math.abs(t.slopePerYear), 2), s.unit)}/yr (Sen's slope, Mann-Kendall p = ${num(t.p, 3)})`;
    let reason: string;
    if (crossing) {
      const range = crossing.slowDays === null
        ? `range ${duration(crossing.fastDays ?? crossing.days)} or longer`
        : `range ${duration(crossing.fastDays ?? crossing.days)} to ${duration(crossing.slowDays)}`;
      reason = `${s.label} ${slope}; reaches the ${withUnit(String(s.threshold), s.unit)} ${s.line} in about ${duration(crossing.days)} (${range}).`;
    } else {
      reason = `${s.label} ${slope}, moving toward the ${withUnit(String(s.threshold), s.unit)} ${s.line} with no crossing inside 3 years.`;
    }

    out.push(contribution(
      "trend",
      trendPoints(crossing?.days ?? null),
      reason,
      lastN(pts, 10).map((p) => ev(s.metric, p)),
      [s.source, "mann_1945", "sen_1968"],
    ));
  }
  return out;
}

/**
 * KDIGO 2012 rapid progression: a significant eGFR decline faster than 5 mL/min/1.73m²/yr floors the CKD flag at
 * review (DECISIONS 2026-10-17). It earns no points, so the row is 0 and the floor is applied in `applyFloors`.
 * Independent of the trend row, because an eGFR already below 60 gets no trend but can still be falling fast.
 */
function rapidEgfrDecline(ctx: Ctx): Contribution | null {
  const pts = ctx.series("egfr");
  const t = labTrend(pts);
  if (!t || !isRapidEgfrDecline(t, THRESHOLDS.ckd.rapidDeclinePerYear)) return null;
  return contribution(
    "trend",
    0,
    `eGFR falling ${num(Math.abs(t.slopePerYear), 1)} mL/min/1.73m²/yr (Sen's slope, Mann-Kendall p = ${num(t.p, 3)}), faster than ${THRESHOLDS.ckd.rapidDeclinePerYear} per year (KDIGO rapid decline); sets this flag to at least review.`,
    lastN(pts, 10).map((p) => ev("egfr", p)),
    [THRESHOLDS.ckd.rapidDeclineSource, "mann_1945", "sen_1968"],
  );
}

/** Home BP: OLS over the daily readings (vitals regime). Systolic and diastolic each get a trend; the sooner one counts. */
function htnTrend(ctx: Ctx): Contribution[] {
  const candidates = [
    { metric: "bp_systolic", threshold: THRESHOLDS.homeBp.systolic, label: "Home systolic" },
    { metric: "bp_diastolic", threshold: THRESHOLDS.homeBp.diastolic, label: "Home diastolic" },
  ].flatMap((c) => {
    const pts = ctx.series(c.metric).filter((p) => p.ts <= ctx.rec.now);
    const t = vitalsTrend(pts, c.threshold);
    if (!t?.passes) return [];
    const points = trendPoints(t.crossingDays);
    const slope = `${c.label} BP rising ${num(t.slopePerYear, 0)} mmHg/yr over ${t.fit.n} days (R² = ${num(t.fit.r2, 2)})`;
    const reason = t.crossingDays === null
      ? `${slope}, moving toward ${c.threshold} mmHg with no crossing inside 3 years.`
      : `${slope}; reaches ${c.threshold} mmHg in about ${duration(t.crossingDays)}.`;
    return [{ points, c: contribution("trend", points, reason, lastN(pts, 3).map((p) => ev(c.metric, p)), [THRESHOLDS.homeBp.source]) }];
  });
  candidates.sort((a, b) => b.points - a.points);
  return candidates.slice(0, 1).map((x) => x.c);
}

function symptomLayer(ctx: Ctx, condition: Condition): Contribution[] {
  const cluster = ctx.clusters.find((c) => c.condition === condition);
  if (!cluster || cluster.points <= 0) return [];
  const counts = new Map<string, number>();
  for (const r of cluster.reports) counts.set(r.code, (counts.get(r.code) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([code, n]) => `${SYMPTOMS[code as keyof typeof SYMPTOMS].label.toLowerCase()} ×${n}`).join(", ");
  const logs = new Set(cluster.reports.map((r) => r.ts)).size;
  const oldest = cluster.reports[cluster.reports.length - 1];
  const weeks = Math.max(1, Math.ceil(daysBetween(oldest.ts, ctx.rec.now) / 7));
  const capped = cluster.raw > cluster.points ? `, capped at ${cluster.points}` : "";
  return [contribution(
    "symptom",
    cluster.points,
    `${plural(logs, "symptom log")} in ${plural(weeks, "week")} (${top}); decayed cluster score ${cluster.raw.toFixed(1)}${capped}.`,
    [],
    [],
  )];
}

/** An adverse shift (up) in a daily series; the latest one counts. */
function changepointLayer(ctx: Ctx, metrics: string[], hasTrend: boolean): Contribution[] {
  const found = metrics.flatMap((m) =>
    ctx.changePoints[m].filter((c) => c.direction === "up").map((c) => ({ m, c })),
  );
  if (found.length === 0) return [];
  const { m, c } = found.reduce((a, b) => (b.c.shiftSd > a.c.shiftSd ? b : a));
  const label = m === "weight_kg" ? "Weight" : m === "bp_systolic" ? "Home systolic" : "Home diastolic";
  const unit = UNIT[m];
  const agrees = hasTrend && m.startsWith("bp_");
  return [contribution(
    "changepoint",
    agrees ? POINTS.changepoint.agreesWithTrend : POINTS.changepoint.adverse,
    `${label} shifted up about ${num(c.shift, 0)} ${unit} around ${monthDay(c.changeTs)} (${num(c.shiftSd)} baseline SDs, CUSUM)${agrees ? ", in line with the trend." : "."}`,
    [{ metric: m, ts: isoTs(c.changeTs), value: Math.round((c.referenceMean + c.shift) * 10) / 10, unit }],
    ["page_1954"],
  )];
}

function metsLayer(ctx: Ctx): Contribution[] {
  const m = ctx.mets;
  if (!m.fires) return [];
  const crit = m.criteria;
  const name: Record<string, string> = { waist: "waist", triglycerides: "triglycerides", hdl: "HDL", bp: "blood pressure", fpg: "fasting glucose" };
  const entries = Object.entries(crit) as [string, { status: string; byTreatment: boolean }][];
  const met = entries.filter(([, v]) => v.status === "met").map(([k, v]) => name[k] + (v.byTreatment ? " (on treatment)" : ""));
  const unknown = entries.filter(([, v]) => v.status === "unknown").map(([k]) => name[k]);
  const evidence: EvidencePoint[] = [];
  if (crit.waist.status === "met" && crit.waist.ts !== null) evidence.push({ metric: "waist_cm", ts: isoTs(crit.waist.ts), value: crit.waist.value!, unit: "cm" });
  if (crit.triglycerides.value !== null && crit.triglycerides.ts !== null) evidence.push({ metric: "triglycerides", ts: isoTs(crit.triglycerides.ts), value: crit.triglycerides.value, unit: "mmol/L" });
  return [contribution(
    "cooccurrence",
    POINTS.cooccurrence[Math.min(m.metCount, 5)],
    `Metabolic syndrome screen: ${m.metCount} of 5 criteria met (${met.join(", ")})${unknown.length ? `, ${unknown.length} unknown (${unknown.join(", ")})` : ""}.`,
    evidence,
    [...m.sourceIds],
  )];
}

function sleepContribution(ctx: Ctx): Contribution | null {
  const s = ctx.stopBang;
  if (s.band === "low") return null;
  const missing = (Object.entries(s.items) as [string, { known: boolean }][]).filter(([, v]) => !v.known).map(([k]) => k);
  const bound = s.lowerBound ? ` (at least ${s.score}; ${missing.join(", ")} not recorded)` : "";
  return contribution(
    "sleep",
    s.band === "high" ? POINTS.sleep.high : POINTS.sleep.intermediate,
    s.band === "high"
      ? `STOP-Bang ${s.score}${bound} is high; screen suggests considering formal sleep assessment.`
      : `STOP-Bang ${s.score}${bound} is intermediate; untreated sleep apnea can push blood pressure, glucose and liver fat.`,
    [],
    [...s.sourceIds],
  );
}

// ---- Orchestrator ---------------------------------------------------------------------------------

function ledger(condition: Condition, contributions: Contribution[], diagnostic = false): ConditionLedger {
  const capped = applyLayerCap(contributions);
  const points = totalPoints(capped);
  return { condition, contributions: capped, points, severity: severityFromPoints(points), basis: "points", diagnostic, label: null };
}

/**
 * Floors on top of the bands, highest first: a diagnostic range or rapid eGFR decline sets at least review, a single
 * unconfirmed abnormal result sets at least monitor. Screens set none.
 */
function applyFloors(l: ConditionLedger, rapid: boolean): ConditionLedger {
  const unconfirmed = l.contributions.some((c) => c.unconfirmed);
  const floors: { severity: Severity; basis: SeverityBasis }[] = [];
  if (l.diagnostic) floors.push({ severity: "review", basis: "diagnostic_floor" });
  if (rapid) floors.push({ severity: "review", basis: "rapid_decline_floor" });
  if (unconfirmed) floors.push({ severity: "monitor", basis: "unconfirmed_floor" });
  const floor = floors.reduce<(typeof floors)[number] | null>((best, f) => (best && severityRank(best.severity) >= severityRank(f.severity) ? best : f), null);
  const label = unconfirmed && !l.diagnostic ? UNCONFIRMED_LABEL : null;
  if (!floor || severityRank(floor.severity) <= severityRank(l.severity)) return { ...l, label };
  return { ...l, severity: floor.severity, basis: floor.basis, label };
}

/** Stale marking: a daily-series trend or shift from a patient who stopped logging (RISK_ENGINE §6, gap layer). */
function markStale(c: Contribution, silence: Silence | null): Contribution {
  if (!silence || (c.layer !== "trend" && c.layer !== "changepoint")) return c;
  if (!c.evidence.some((e) => HEARTBEAT_METRICS.has(e.metric))) return c;
  return { ...c, stale: true, reason: `${c.reason} Last reading ${silence.daysSince} days ago.` };
}

export function evaluate(rec: PatientRecord): Evaluation {
  const ctx = buildCtx(rec);
  const heartbeats = [...HEARTBEAT_METRICS].flatMap((m) => ctx.series(m).map((p) => p.ts));
  const silence = rec.silence === undefined ? detectSilence(heartbeats, rec.now) : rec.silence;
  const sleep = sleepContribution(ctx);

  const t2dT = t2dThreshold(ctx);
  const ckdT = ckdThreshold(ctx);
  const htnT = htnThreshold(ctx);

  const ledgers: ConditionLedger[] = [];
  /** Primary layers fire a flag on their own; changepoint and sleep only count once the condition has one. */
  const build = (
    condition: Condition,
    primary: Contribution[],
    support: (hasTrend: boolean) => Contribution[],
    diagnostic = false,
    rapid = false,
  ) => {
    const hasTrend = primary.some((c) => c.layer === "trend");
    const all = hasPrimary(primary) || rapid ? [...primary, ...support(hasTrend)] : primary;
    const l = ledger(condition, all.map((c) => markStale(c, silence)), diagnostic);
    if (l.contributions.length > 0) ledgers.push(applyFloors(l, rapid));
  };
  const sleepSupport = sleep ? [sleep] : [];

  build("t2d",
    [...t2dT.contributions, ...canriskScore(ctx), ...labTrends(ctx, LAB_TRENDS.t2d), ...symptomLayer(ctx, "t2d")],
    (hasTrend) => [...changepointLayer(ctx, ["weight_kg"], hasTrend), ...sleepSupport], t2dT.diagnostic);
  const rapidRow = rapidEgfrDecline(ctx);
  build("ckd",
    [...ckdT.contributions, ...labTrends(ctx, LAB_TRENDS.ckd), ...(rapidRow ? [rapidRow] : []), ...symptomLayer(ctx, "ckd")],
    () => [], ckdT.diagnostic, rapidRow !== null);
  build("htn",
    [...htnT.contributions, ...htnTrend(ctx), ...symptomLayer(ctx, "htn")],
    (hasTrend) => [...changepointLayer(ctx, ["bp_systolic", "bp_diastolic"], hasTrend), ...sleepSupport], htnT.diagnostic);
  build("masld", [...masldScores(ctx), ...symptomLayer(ctx, "masld")], () => sleepSupport);
  build("mets", metsLayer(ctx), () => []);

  // STOP-Bang high fires its own monitor flag regardless of points.
  if (ctx.stopBang.band === "high" && sleep) {
    const l = ledger("osa", [sleep]);
    ledgers.push({ ...l, severity: "monitor", basis: "osa_screen" });
  }

  if (silence) {
    const l = ledger("engagement", [contribution(
      "gap",
      POINTS.gap,
      `Stopped logging: last reading ${silence.daysSince} days ago, after logging on ${silence.activeDays} of the 30 days before that.`,
      [],
      [],
    )]);
    ledgers.push({ ...l, severity: "monitor", basis: "gap_only" });
  }

  // Two or more conditions in a diagnostic range set urgent (the single-condition floors are in applyFloors).
  const diagnostic = ledgers.filter((l) => l.diagnostic);
  if (diagnostic.length >= 2) {
    for (const l of diagnostic) {
      l.basis = l.severity === "urgent" && l.basis === "points" ? "points" : "multiple_diagnostic";
      l.severity = "urgent";
    }
  }

  const redFlags = activeRedFlags(rec.symptomLogs, rec.now);
  const worst = ledgers.reduce<Severity | null>((acc, l) => maxSeverity(acc, l.severity), null);

  return {
    patientId: rec.patientId,
    now: rec.now,
    conditions: ledgers,
    redFlags,
    patientSeverity: redFlags.length > 0 ? "urgent" : worst,
    silence,
    stopBang: ctx.stopBang,
    mets: ctx.mets,
  };
}
