import { labCrossing, labTrend, senValueAt, type LabCrossing, type LabTrend } from "@/engine/labtrend";
import { THRESHOLDS } from "@/engine/sources";
import { DAY_MS, type Pt } from "@/engine/types";

// Chart data for the patient-detail lab charts (T-042). Trend-eligible metrics (DECISIONS 2026-10-17
// 06:00: "trend flags fire only for metrics with a guideline threshold") get the Sen projection line and
// threshold bands; the rest are chart-only (raw points, no line, no band).

export type ThresholdBand = { value: number; label: string };

export type LabChartMetric = {
  metric: string;
  label: string;
  unit: string;
  bands: ThresholdBand[];
  /** The threshold a Sen crossing is projected against, when this metric is trend-eligible. */
  crossingThreshold: number | null;
};

const LAB_CHART_METRICS: LabChartMetric[] = [
  {
    metric: "hba1c", label: "HbA1c", unit: "%",
    bands: [
      { value: THRESHOLDS.hba1c.atRiskFrom, label: "at risk" },
      { value: THRESHOLDS.hba1c.prediabetesFrom, label: "prediabetes" },
      { value: THRESHOLDS.hba1c.diabetesFrom, label: "diabetes" },
    ],
    crossingThreshold: THRESHOLDS.hba1c.prediabetesFrom,
  },
  {
    metric: "fpg", label: "Fasting glucose", unit: "mmol/L",
    bands: [
      { value: THRESHOLDS.fpg.atRiskFrom, label: "at risk" },
      { value: THRESHOLDS.fpg.prediabetesFrom, label: "prediabetes" },
      { value: THRESHOLDS.fpg.diabetesFrom, label: "diabetes" },
    ],
    crossingThreshold: THRESHOLDS.fpg.prediabetesFrom,
  },
  {
    metric: "egfr", label: "eGFR", unit: "mL/min/1.73m²",
    bands: [{ value: THRESHOLDS.ckd.egfrCkdBelow, label: "CKD" }],
    crossingThreshold: THRESHOLDS.ckd.egfrCkdBelow,
  },
  {
    metric: "acr", label: "Urine ACR", unit: "mg/mmol",
    bands: [
      { value: THRESHOLDS.ckd.acrA2From, label: "A2" },
      { value: THRESHOLDS.ckd.acrA3From, label: "A3" },
    ],
    crossingThreshold: THRESHOLDS.ckd.acrA2From,
  },
  { metric: "alt", label: "ALT", unit: "U/L", bands: [], crossingThreshold: null },
  { metric: "ast", label: "AST", unit: "U/L", bands: [], crossingThreshold: null },
  { metric: "ggt", label: "GGT", unit: "U/L", bands: [], crossingThreshold: null },
  { metric: "platelets", label: "Platelets", unit: "10^9/L", bands: [], crossingThreshold: null },
  { metric: "hdl", label: "HDL", unit: "mmol/L", bands: [], crossingThreshold: null },
];

export type LabChartSeries = {
  metric: string;
  label: string;
  unit: string;
  bands: ThresholdBand[];
  points: Pt[];
  /** Sen trend line, only when the Mann-Kendall gate passes (n >= 4, p < 0.10). */
  trend: LabTrend | null;
  /** Projected crossing of `crossingThreshold`, only when the trend passes, heads toward it, and lands
   * inside the 3 year horizon (same gate `evaluate.ts`'s `labTrends` uses for points). */
  crossing: LabCrossing | null;
  /** [start, end] ts of the line to draw, historical start through the projected (or last) point. */
  lineDomain: [number, number] | null;
};

const PROJECTION_PAST_HORIZON_DAYS = 90; // draw a little projected line even with no crossing, for legibility

/** Builds one chart series per lab metric that has at least one observation. Metrics with none are omitted. */
export function buildLabCharts(observations: { ts: Date | string; metric: string; value: number }[]): LabChartSeries[] {
  const byMetric = new Map<string, Pt[]>();
  for (const o of observations) {
    const ts = typeof o.ts === "string" ? Date.parse(o.ts) : o.ts.getTime();
    const series = byMetric.get(o.metric) ?? [];
    series.push({ ts, value: o.value });
    byMetric.set(o.metric, series);
  }
  for (const pts of byMetric.values()) pts.sort((a, b) => a.ts - b.ts);

  return LAB_CHART_METRICS.flatMap((cfg) => {
    const points = byMetric.get(cfg.metric);
    if (!points || points.length === 0) return [];
    const trend = labTrend(points);
    const crossing = trend && cfg.crossingThreshold !== null ? labCrossing(trend, cfg.crossingThreshold) : null;

    let lineDomain: [number, number] | null = null;
    if (trend) {
      const lastTs = points[points.length - 1].ts;
      const endTs = crossing ? lastTs + crossing.days * DAY_MS : lastTs + PROJECTION_PAST_HORIZON_DAYS * DAY_MS;
      lineDomain = [trend.firstTs, endTs];
    }

    return [{
      metric: cfg.metric, label: cfg.label, unit: cfg.unit, bands: cfg.bands, points, trend, crossing, lineDomain,
    }];
  });
}

/** Samples the Sen line at `n` evenly spaced points across `domain`, for drawing with Recharts. */
export function senLinePoints(trend: LabTrend, domain: [number, number], n = 24): Pt[] {
  const [start, end] = domain;
  return Array.from({ length: n + 1 }, (_, i) => {
    const ts = start + ((end - start) * i) / n;
    return { ts, value: senValueAt(trend, ts) };
  });
}
