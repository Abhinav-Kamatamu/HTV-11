// T-007: proves the Tiger Data SQL fit (src/db/vitals.ts `olsFitSql`) matches a pure-TS OLS
// (src/engine/trends.ts `olsFit`) on the same vitals, patient by patient, metric by metric, over
// the live seed data — "the database is an optimization, not a second source of truth"
// (RISK_ENGINE §8). Not part of `npm test` (no DB there, same convention as timescale.test.ts);
// run with `npm run db:verify-vitals` after seeding.
import { eq } from "drizzle-orm";
import { getDb, getPool } from "../src/db/client";
import { observations, patients } from "../src/db/schema";
import { crossingDays, olsFit, slopePerYear, type OlsFit } from "../src/engine/trends";
import { HEARTBEAT_METRICS } from "../src/engine/silence";
import { THRESHOLDS } from "../src/engine/sources";
import { olsFitSql } from "../src/db/vitals";

const THRESHOLD_BY_METRIC: Record<string, number> = {
  bp_systolic: THRESHOLDS.homeBp.systolic,
  bp_diastolic: THRESHOLDS.homeBp.diastolic,
  weight_kg: 0, // no guideline threshold; crossing is expected to stay null either way
  resting_hr: 0,
  steps: 0,
  sleep_hours: 0,
};

const TOLERANCE = 1e-6;

function close(a: number, b: number, tol = TOLERANCE): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

function diffFit(sqlFit: OlsFit, tsFit: OlsFit): string[] {
  const problems: string[] = [];
  if (sqlFit.n !== tsFit.n) problems.push(`n: sql=${sqlFit.n} ts=${tsFit.n}`);
  if (!close(sqlFit.slopePerDay, tsFit.slopePerDay)) problems.push(`slopePerDay: sql=${sqlFit.slopePerDay} ts=${tsFit.slopePerDay}`);
  if (!close(sqlFit.intercept, tsFit.intercept)) problems.push(`intercept: sql=${sqlFit.intercept} ts=${tsFit.intercept}`);
  if (!close(sqlFit.r2, tsFit.r2)) problems.push(`r2: sql=${sqlFit.r2} ts=${tsFit.r2}`);
  return problems;
}

async function main() {
  const db = getDb();
  const now = Date.now();
  const allPatients = await db.select({ id: patients.id, name: patients.name }).from(patients);

  let checked = 0;
  let mismatches = 0;
  for (const patient of allPatients) {
    const rows = await db.select({ ts: observations.ts, metric: observations.metric, value: observations.value })
      .from(observations).where(eq(observations.patientId, patient.id));

    for (const metric of HEARTBEAT_METRICS) {
      const points = rows.filter((r) => r.metric === metric).map((r) => ({ ts: r.ts.getTime(), value: r.value }));
      const tsFit = olsFit(points);
      const sqlFit = await olsFitSql(db, { patientId: patient.id, metric });
      checked++;

      if (tsFit === null && sqlFit === null) continue;
      if (tsFit === null || sqlFit === null) {
        console.error(`${patient.name} ${metric}: null mismatch (sql=${sqlFit} ts=${tsFit})`);
        mismatches++;
        continue;
      }
      const problems = diffFit(sqlFit, tsFit);
      const threshold = THRESHOLD_BY_METRIC[metric] ?? 0;
      const sqlCrossing = crossingDays(sqlFit, threshold, now);
      const tsCrossing = crossingDays(tsFit, threshold, now);
      if ((sqlCrossing === null) !== (tsCrossing === null) || (sqlCrossing !== null && tsCrossing !== null && !close(sqlCrossing, tsCrossing, 1e-4))) {
        problems.push(`crossingDays: sql=${sqlCrossing} ts=${tsCrossing}`);
      }
      if (problems.length > 0) {
        console.error(`${patient.name} ${metric}: ${problems.join("; ")}`);
        mismatches++;
      } else if (tsFit.n >= 2) {
        console.log(`${patient.name} ${metric}: n=${tsFit.n} slope/yr=${slopePerYear(tsFit).toFixed(3)} r2=${tsFit.r2.toFixed(3)} OK`);
      }
    }
  }

  console.log(`\n${checked} patient-metric pairs checked, ${mismatches} mismatches`);
  await getPool().end();
  if (mismatches > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
