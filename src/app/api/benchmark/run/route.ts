import { and, eq } from "drizzle-orm";
import { medianMs } from "@/app/api/_lib/benchmark";
import { runEngineForPatient } from "@/app/api/_lib/engine-db";
import { ok, withErrors } from "@/app/api/_lib/http";
import { getDb } from "@/db/client";
import { observations, patients } from "@/db/schema";
import { listSilenceSql } from "@/db/silence";
import { olsFitRawSql, olsFitSql } from "@/db/vitals";
import { crossingDays, olsFit } from "@/engine/trends";
import type { Pt } from "@/engine/types";

// POST /api/benchmark/run (ARCHITECTURE.md, T-010): backs the "Synthetic scale test" page (T-048).
// Median of 5 warm runs for three ways of getting the same vitals OLS (slope/R²/crossing) over every
// patient, plus the silent-patient scan and a full engine re-run, each timed standalone. Nothing
// hard-coded: patient and row counts come from live queries, not the seed's known shape.

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

    const continuousAggregate = await medianMs(async () => {
      let rows = 0;
      for (const patientId of patientIds) {
        for (const metric of VITALS_METRICS) {
          const fit = await olsFitSql(db, { patientId, metric });
          if (fit) rows += fit.n;
        }
      }
      return rows;
    });

    const rawTable = await medianMs(async () => {
      let rows = 0;
      for (const patientId of patientIds) {
        for (const metric of VITALS_METRICS) {
          const fit = await olsFitRawSql(db, { patientId, metric });
          if (fit) rows += fit.n;
        }
      }
      return rows;
    });

    const fetchAndCompute = await medianMs(async () => {
      let rows = 0;
      for (const patientId of patientIds) {
        for (const metric of VITALS_METRICS) {
          const raw = await db
            .select({ ts: observations.ts, value: observations.value })
            .from(observations)
            .where(and(eq(observations.patientId, patientId), eq(observations.metric, metric)));
          const points: Pt[] = raw.map((r) => ({ ts: r.ts.getTime(), value: r.value }));
          const fit = olsFit(points);
          if (!fit) continue;
          rows += fit.n;
          const threshold = THRESHOLD[metric];
          if (threshold !== undefined) crossingDays(fit, threshold, now);
        }
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
