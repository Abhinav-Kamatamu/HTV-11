import { detectChangePoints, type ChangePoint } from "@/engine/changepoint";
import type { Silence } from "@/engine/silence";
import type { Pt } from "@/engine/types";

// Chart data for the patient-detail vitals charts (T-046). Unlike labs, vitals are dense daily series
// over weeks (SPEC §6 demo: "home BP chart, CUSUM marker shifted up around Sep 3") — no Sen projection,
// just the raw daily series plus any CUSUM change-points (RISK_ENGINE §3c).
//
// T-047: vitals are the only charts that can go stale this way — `silence.ts`/`evaluate()` only mark
// the daily-series (heartbeat) contributions stale when a patient stops logging; labs aren't a
// heartbeat (`evaluate.test.ts` "does not mark lab trends stale"), so `lab-chart.tsx` gets no such label.

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
  /** Days since the patient's last heartbeat reading, when they've stopped logging (same `Silence`
   * the engine marks the daily-series contribution stale with — patient-level, not per-metric). */
  staleDays?: number;
};

/** Builds one chart series per vitals metric that has at least one observation. Metrics with none are
 * omitted. `silence` (the patient's `Evaluation.silence`, or the batched `listSilenceSql` result) adds
 * a stale-trend label to every series when set. */
export function buildVitalsCharts(
  observations: { ts: Date | string; metric: string; value: number }[], silence?: Silence | null,
): VitalsChartSeries[] {
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
    return [{
      metric: cfg.metric, label: cfg.label, unit: cfg.unit, points, changePoints: detectChangePoints(points),
      staleDays: silence?.daysSince,
    }];
  });
}
