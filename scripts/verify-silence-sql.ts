// T-008: proves the Tiger Data SQL silence scan (src/db/silence.ts `listSilenceSql`) agrees with the
// engine's pure `detectSilence` (src/engine/silence.ts) over the live seed, patient by patient — the
// SQL is an optimization, not a second source of truth (RISK_ENGINE §8, same framing as T-007). Not
// part of `npm test` (no DB there); run with `npm run db:verify-silence`.
import { getDb, getPool } from "../src/db/client";
import { observations, patients } from "../src/db/schema";
import { listSilenceSql } from "../src/db/silence";
import { detectSilence, HEARTBEAT_METRICS } from "../src/engine/silence";

async function main() {
  const db = getDb();
  const now = Date.now();

  const allPatients = await db.select({ id: patients.id, name: patients.name }).from(patients);
  const allObs = await db.select({ patientId: observations.patientId, ts: observations.ts, metric: observations.metric })
    .from(observations);

  const sqlSilence = await listSilenceSql(db, now);

  let mismatches = 0;
  for (const patient of allPatients) {
    const timestamps = allObs
      .filter((o) => o.patientId === patient.id && HEARTBEAT_METRICS.has(o.metric))
      .map((o) => o.ts.getTime());
    const tsResult = detectSilence(timestamps, now);
    const sqlResult = sqlSilence.get(patient.id) ?? null;

    const bothNull = tsResult === null && sqlResult === null;
    const bothSame = tsResult !== null && sqlResult !== null
      && tsResult.lastTs === sqlResult.lastTs && tsResult.daysSince === sqlResult.daysSince
      && tsResult.activeDays === sqlResult.activeDays;

    if (bothNull) continue;
    if (bothSame) {
      console.log(`${patient.name}: SILENT daysSince=${tsResult!.daysSince} activeDays=${tsResult!.activeDays} OK`);
      continue;
    }
    console.error(`${patient.name}: MISMATCH ts=${JSON.stringify(tsResult)} sql=${JSON.stringify(sqlResult)}`);
    mismatches++;
  }

  console.log(`\n${allPatients.length} patients checked, ${mismatches} mismatches`);
  await getPool().end();
  if (mismatches > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
