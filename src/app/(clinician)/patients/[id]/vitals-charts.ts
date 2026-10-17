import { detectChangePoints, type ChangePoint } from "@/engine/changepoint";
import type { Pt } from "@/engine/types";

// Chart data for the patient-detail vitals charts (T-046). Unlike labs, vitals are dense daily series
// over weeks (SPEC §6 demo: "home BP chart, CUSUM marker shifted up around Sep 3") — no Sen projection,
// just the raw daily series plus any CUSUM change-points (RISK_ENGINE §3c).

export type VitalsChartMetric = { metric: string; label: string; unit: string };

const VITALS_CHART_METRICS: VitalsChartMetric[] = [
  { metric: "bp_systolic", label: "Home systolic BP", unit: "mmHg" },
  { metric: "bp_diastolic", label: "Home diastolic BP", unit: "mmHg" },
  { metric: "weight_kg", label: "Weight", unit: "kg" },
];

export type VitalsChartSeries = {
  metric: string;
  label: string;
  unit: string;
  points: Pt[];
  changePoints: ChangePoint[];
};

/** Builds one chart series per vitals metric that has at least one observation. Metrics with none are omitted. */
export function buildVitalsCharts(observations: { ts: Date | string; metric: string; value: number }[]): VitalsChartSeries[] {
  const byMetric = new Map<string, Pt[]>();
  for (const o of observations) {
    const ts = typeof o.ts === "string" ? Date.parse(o.ts) : o.ts.getTime();
    const series = byMetric.get(o.metric) ?? [];
    series.push({ ts, value: o.value });
    byMetric.set(o.metric, series);
  }
  for (const pts of byMetric.values()) pts.sort((a, b) => a.ts - b.ts);

  return VITALS_CHART_METRICS.flatMap((cfg) => {
    const points = byMetric.get(cfg.metric);
    if (!points || points.length === 0) return [];
    return [{ metric: cfg.metric, label: cfg.label, unit: cfg.unit, points, changePoints: detectChangePoints(points) }];
  });
}
