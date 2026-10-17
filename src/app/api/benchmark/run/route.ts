import { and, inArray } from "drizzle-orm";
import { medianMs } from "@/app/api/_lib/benchmark";
import { runEngineForPatient } from "@/app/api/_lib/engine-db";
import { ok, withErrors } from "@/app/api/_lib/http";
import { getDb } from "@/db/client";
import { observations, patients } from "@/db/schema";
import { listSilenceSql } from "@/db/silence";
import { olsFitBatchSql, olsFitRawBatchSql } from "@/db/vitals";
import { crossingDays, olsFit } from "@/engine/trends";
import type { Pt } from "@/engine/types";

// POST /api/benchmark/run (ARCHITECTURE.md, T-010): backs the "Synthetic scale test" page (T-048).
// Median of 5 warm runs for three ways of getting the same vitals OLS (slope/R²/crossing) over every
// patient, plus the silent-patient scan and a full engine re-run, each timed standalone. Nothing
// hard-coded: patient and row counts come from live queries, not the seed's known shape.

// T-012: each vitals path used to loop one awaited query per (patient, metric) pair — 150 round
// trips on the default 25-patient seed, which dominated the timing over the actual query-plan cost
// and made the three paths land within noise of each other (relay/core.md Gotchas, T-010). Each
// path below now runs as exactly one batched query (`WHERE patient_id IN (...) AND metric IN (...)`,
// grouped), so whatever the continuous aggregate actually saves shows up at this scale too, not only
// at `--scale`.

// Vitals-only (RISK_ENGINE §3b/§8): the metrics dense enough for OLS in the continuous aggregates.
// Labs (hba1c, fpg, egfr, acr) use Mann-Kendall + Sen's slope instead (§3a, T-027) and are never
// computed in SQL, so they're not part of this comparison.
const VITALS_METRICS = ["bp_systolic", "bp_diastolic", "weight_kg", "resting_hr", "steps", "sleep_hours"] as const;
type VitalsMetric = (typeof VITALS_METRICS)[number];

// Only metrics with a guideline threshold (RISK_ENGINE §3b) have a crossing to project.
const THRESHOLD: Partial<Record<VitalsMetric, number>> = { bp_systolic: 130, bp_diastolic: 80 };

export async function POST() {
  return withErrors(async () => {
    const db = getDb();
    const now = Date.now();

    const allPatients = await db.select({ id: patients.id }).from(patients);
    const patientIds = allPatients.map((p) => p.id);

    const sumRows = (fits: Map<string, Map<string, { n: number }>>) => {
      let rows = 0;
      for (const byMetric of fits.values()) for (const fit of byMetric.values()) rows += fit.n;
      return rows;
    };

    const continuousAggregate = await medianMs(async () => {
      const fits = await olsFitBatchSql(db, { patientIds, metrics: VITALS_METRICS });
      return sumRows(fits);
    });

    const rawTable = await medianMs(async () => {
      const fits = await olsFitRawBatchSql(db, { patientIds, metrics: VITALS_METRICS });
      return sumRows(fits);
    });

    const fetchAndCompute = await medianMs(async () => {
      const raw = await db
        .select({ patientId: observations.patientId, metric: observations.metric, ts: observations.ts, value: observations.value })
        .from(observations)
        .where(and(inArray(observations.patientId, patientIds), inArray(observations.metric, VITALS_METRICS)));
      const byGroup = new Map<string, Pt[]>();
      for (const r of raw) {
        const key = `${r.patientId}\u0000${r.metric}`;
        let points = byGroup.get(key);
        if (!points) {
          points = [];
          byGroup.set(key, points);
        }
        points.push({ ts: r.ts.getTime(), value: r.value });
      }
      let rows = 0;
      for (const [key, points] of byGroup) {
        const fit = olsFit(points);
        if (!fit) continue;
        rows += fit.n;
        const metric = key.slice(key.indexOf("\u0000") + 1) as VitalsMetric;
        const threshold = THRESHOLD[metric];
        if (threshold !== undefined) crossingDays(fit, threshold, now);
      }
      return rows;
    });

    const silenceScan = await medianMs(() => listSilenceSql(db, now));

    const engineRerun = await medianMs(async () => {
      let flagsWritten = 0;
      for (const patientId of patientIds) {
        const { flags } = await runEngineForPatient(db, patientId, now);
        flagsWritten += flags.length;
      }
      return flagsWritten;
    });

    return ok({
      patientCount: patientIds.length,
      paths: {
        continuousAggregate: { ms: continuousAggregate.ms, rows: continuousAggregate.result },
        rawTable: { ms: rawTable.ms, rows: rawTable.result },
        fetchAndCompute: { ms: fetchAndCompute.ms, rows: fetchAndCompute.result },
      },
      silenceScan: { ms: silenceScan.ms, silentPatients: silenceScan.result.size },
      engineRerun: { ms: engineRerun.ms, flagsWritten: engineRerun.result },
    });
  });
}
