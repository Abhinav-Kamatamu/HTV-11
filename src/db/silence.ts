import { sql } from "drizzle-orm";
import type { getDb } from "./client";
import { HEARTBEAT_METRICS, SILENCE, type Silence } from "../engine/silence";
import { DAY_MS, dayOf } from "../engine/types";

// Patients who stopped logging (RISK_ENGINE §8, T-008): a Tiger Data `heartbeat_agg`/`dead_ranges`
// scan across every patient in one query, must agree with the engine's pure `detectSilence`
// (verified by `scripts/verify-silence-sql.ts`). `heartbeat_liveness` is `SILENCE.quietDays` so a
// "dead range" only ever means the same thing `detectSilence` means by silent.

type Db = ReturnType<typeof getDb>;

// db.execute() (raw SQL) returns timestamptz columns as strings, unlike drizzle's typed select().
type GapRow = { patient_id: string; gap_start: string; gap_end: string };
type ActiveDaysRow = { patient_id: string; active_days: string | number };

const EPSILON_MS = 1000; // timestamptz round-trip tolerance for "this gap reaches now"

/**
 * Every patient whose last heartbeat (one of `HEARTBEAT_METRICS`) is `SILENCE.quietDays` or more
 * before `now`, with the activity check applied (RISK_ENGINE §8: active on ≥ half the 30 days ending
 * on that last reading). One batched `heartbeat_agg` query finds the candidates (any patient whose
 * trailing gap reaches `now`); a second, small query — only over those candidates — counts active
 * days. Patients who were never active, or whose gap is shorter than `quietDays`, are absent from
 * the map (same as `detectSilence` returning null).
 */
export async function listSilenceSql(db: Db, now: number): Promise<Map<string, Silence>> {
  // `sql` explodes a JS array into one bound param per element, not a single array param — build an
  // explicit IN-list rather than `= ANY($1::text[])` (found by running this against Tiger Cloud).
  const metricList = sql.join([...HEARTBEAT_METRICS].map((m) => sql`${m}`), sql`, `);
  const nowDate = new Date(now);

  // win_start = each patient's own first heartbeat, so there is no leading dead-range to trim
  // (DECISIONS 2026-10-17) — the window IS their history, from their first reading to `now`.
  const gaps = await db.execute(sql`
    SELECT t.patient_id, dr.start AS gap_start, dr."end" AS gap_end
    FROM (
      SELECT o.patient_id,
        heartbeat_agg(o.ts, w.win_start, ${nowDate}::timestamptz - w.win_start, ${SILENCE.quietDays} * INTERVAL '1 day') AS agg
      FROM observations o
      JOIN (
        SELECT patient_id, min(ts) AS win_start FROM observations
        WHERE metric IN (${metricList}) AND ts <= ${nowDate}
        GROUP BY patient_id
      ) w ON w.patient_id = o.patient_id
      WHERE o.metric IN (${metricList}) AND o.ts <= ${nowDate}
      GROUP BY o.patient_id, w.win_start
    ) t
    CROSS JOIN LATERAL dead_ranges(t.agg) dr
  `);

  const candidates = (gaps.rows as GapRow[]).filter(
    (r) => Math.abs(new Date(r.gap_end).getTime() - now) <= EPSILON_MS,
  );
  if (candidates.length === 0) return new Map();

  // `dead_ranges()` only counts a patient dead once the liveness grace period has elapsed, so
  // `gap_start = lastHeartbeat + heartbeat_liveness` (confirmed against Rosa Delgado's seed data:
  // her last reading is Oct 6 21:00Z, `heartbeat_liveness` is 7 days, and the gap this query returns
  // starts Oct 13 21:00Z) — subtract it back out to get the real last heartbeat.
  const lastTsByPatient = new Map(
    candidates.map((r) => [r.patient_id, new Date(r.gap_start).getTime() - SILENCE.quietDays * DAY_MS]),
  );
  const ids = [...lastTsByPatient.keys()];

  // Per-candidate activity window: the 30 days (by calendar day, UTC) ending on that patient's own
  // last reading — same `from = dayOf(lastTs) - 29` as `detectSilence`.
  const activeDaysRows = await Promise.all(
    ids.map((patientId) => {
      const lastTs = lastTsByPatient.get(patientId)!;
      return db.execute(sql`
        SELECT ${patientId}::uuid AS patient_id,
          count(DISTINCT floor(extract(epoch FROM ts) / 86400)) AS active_days
        FROM observations
        WHERE patient_id = ${patientId}::uuid AND metric IN (${metricList})
          AND floor(extract(epoch FROM ts) / 86400) BETWEEN
            floor(${lastTs}::double precision / 86400000) - ${SILENCE.lookbackDays - 1}
            AND floor(${lastTs}::double precision / 86400000)
      `);
    }),
  );

  const result = new Map<string, Silence>();
  for (const { rows } of activeDaysRows) {
    const row = rows[0] as ActiveDaysRow;
    const activeDays = Number(row.active_days);
    if (activeDays < SILENCE.lookbackDays * SILENCE.activeShare) continue;
    const lastTs = lastTsByPatient.get(row.patient_id)!;
    result.set(row.patient_id, { lastTs, daysSince: dayOf(now) - dayOf(lastTs), activeDays });
  }
  return result;
}
