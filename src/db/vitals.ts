import { sql } from "drizzle-orm";
import type { getDb } from "./client";
import type { OlsFit } from "../engine/trends";

// Tiger Data vitals math (RISK_ENGINE §8, T-007): the same `OlsFit` trends.ts computes from raw
// points, computed instead from `stats_agg` through the continuous aggregates. Returning the exact
// `OlsFit` shape lets callers reuse trends.ts's own `slopePerYear`/`crossingDays` rather than a second
// implementation of the crossing-day math — "the database is an optimization, not a second source of
// truth" (RISK_ENGINE §8). Verified against a pure-TS OLS on the seed vitals: `scripts/verify-vitals-sql.ts`.

type Db = ReturnType<typeof getDb>;

export const AGGREGATES = ["obs_daily", "obs_weekly", "obs_monthly"] as const;
export type Aggregate = (typeof AGGREGATES)[number];

type FitRow = {
  n: string | number | null;
  slope_per_day: number | null;
  intercept: number | null;
  r2: number | null;
  x_mean: number | null;
  y_mean: number | null;
};

/** Pure, so it's unit-testable without a database: `olsFit`'s null cases (< 2 points) and
 * `determination_coeff`'s null-when-no-variance case (DECISIONS 2026-10-17: treated as r2 = 1, same
 * as `olsFit`'s `syy === 0` branch). */
export function mapFitRow(row: FitRow | undefined): OlsFit | null {
  if (!row || row.n === null || Number(row.n) < 2) return null;
  return {
    n: Number(row.n),
    slopePerDay: row.slope_per_day ?? 0,
    intercept: row.intercept ?? 0,
    r2: row.r2 ?? 1,
    xMean: row.x_mean ?? 0,
    yMean: row.y_mean ?? 0,
  };
}

/**
 * `rollup(stats)` over every bucket for one patient+metric in `aggregate`, read with
 * `slope()`/`intercept()`/`determination_coeff()`/`sum_x()`/`sum_y()`/`num_vals()`. `sinceMs` limits
 * to buckets at or after that instant (RISK_ENGINE §8's "30 or 90 day window"); omitted, it's every
 * bucket ever recorded — the same "whatever history was passed in" that `evaluate.ts`'s `htnTrend`
 * gives the pure-TS `vitalsTrend` today.
 */
export async function olsFitSql(
  db: Db,
  args: { patientId: string; metric: string; aggregate?: Aggregate; sinceMs?: number },
): Promise<OlsFit | null> {
  const { patientId, metric, aggregate = "obs_daily", sinceMs } = args;
  if (!(AGGREGATES as readonly string[]).includes(aggregate)) {
    throw new Error(`unknown aggregate ${aggregate}`);
  }
  const table = sql.raw(aggregate); // whitelisted above, never user input
  const sinceClause = sinceMs !== undefined ? sql`AND bucket >= to_timestamp(${sinceMs / 1000})` : sql``;
  const result = await db.execute(sql`
    SELECT
      num_vals(agg) AS n,
      slope(agg) AS slope_per_day,
      intercept(agg) AS intercept,
      determination_coeff(agg) AS r2,
      sum_x(agg) / num_vals(agg) AS x_mean,
      sum_y(agg) / num_vals(agg) AS y_mean
    FROM (
      SELECT rollup(stats) AS agg FROM ${table}
      WHERE patient_id = ${patientId} AND metric = ${metric} ${sinceClause}
    ) t
  `);
  return mapFitRow(result.rows[0] as FitRow | undefined);
}

/**
 * Same `stats_agg`/`rollup` math as `olsFitSql`, but built straight from raw `observations` instead of
 * a continuous aggregate (T-010's "raw table" path) — the aggregate Tiger Data would otherwise have
 * pre-computed. `sinceMs` filters on `ts` directly (no bucket column here).
 */
export async function olsFitRawSql(
  db: Db,
  args: { patientId: string; metric: string; sinceMs?: number },
): Promise<OlsFit | null> {
  const { patientId, metric, sinceMs } = args;
  const sinceClause = sinceMs !== undefined ? sql`AND ts >= to_timestamp(${sinceMs / 1000})` : sql``;
  const result = await db.execute(sql`
    SELECT
      num_vals(agg) AS n,
      slope(agg) AS slope_per_day,
      intercept(agg) AS intercept,
      determination_coeff(agg) AS r2,
      sum_x(agg) / num_vals(agg) AS x_mean,
      sum_y(agg) / num_vals(agg) AS y_mean
    FROM (
      SELECT stats_agg(value, extract(epoch FROM ts) / 86400.0) AS agg
      FROM observations
      WHERE patient_id = ${patientId} AND metric = ${metric} ${sinceClause}
    ) t
  `);
  return mapFitRow(result.rows[0] as FitRow | undefined);
}

type BatchFitRow = FitRow & { patient_id: string; metric: string };

/** Groups one path's batched rows by patient then metric, dropping any `mapFitRow` returned null
 * for (same < 2 points rule as the single-patient functions). Pure, so it's unit-testable without
 * a database — the two batch functions below only add the SQL that produces these rows. */
export function groupFitRows(rows: BatchFitRow[]): Map<string, Map<string, OlsFit>> {
  const out = new Map<string, Map<string, OlsFit>>();
  for (const row of rows) {
    const fit = mapFitRow(row);
    if (!fit) continue;
    if (!out.has(row.patient_id)) out.set(row.patient_id, new Map());
    out.get(row.patient_id)!.set(row.metric, fit);
  }
  return out;
}

/** `sql` explodes a JS array into one bound param per element wrapped as a single tuple, not a
 * comma-separated list usable in `IN (...)` (confirmed against Tiger Cloud, same Gotcha as
 * `silence.ts`'s `listSilenceSql`) — build the IN-list by hand instead of `= ANY($1::text[])`. */
function inList(values: readonly string[]) {
  return sql.join(values.map((v) => sql`${v}`), sql`, `);
}

/**
 * `olsFitSql`, batched across every (patientId, metric) pair in one query instead of one round trip
 * per pair (T-012: 150 awaited queries per path on the default 25-patient seed was dominating the
 * benchmark route's timing over the actual query-plan cost, masking the continuous aggregate's real
 * advantage). Same `rollup(stats)` math, grouped by `patient_id, metric` instead of filtered to one.
 */
export async function olsFitBatchSql(
  db: Db,
  args: { patientIds: readonly string[]; metrics: readonly string[]; aggregate?: Aggregate; sinceMs?: number },
): Promise<Map<string, Map<string, OlsFit>>> {
  const { patientIds, metrics, aggregate = "obs_daily", sinceMs } = args;
  if (!(AGGREGATES as readonly string[]).includes(aggregate)) {
    throw new Error(`unknown aggregate ${aggregate}`);
  }
  const table = sql.raw(aggregate); // whitelisted above, never user input
  const sinceClause = sinceMs !== undefined ? sql`AND bucket >= to_timestamp(${sinceMs / 1000})` : sql``;
  const result = await db.execute(sql`
    SELECT
      patient_id, metric,
      num_vals(agg) AS n,
      slope(agg) AS slope_per_day,
      intercept(agg) AS intercept,
      determination_coeff(agg) AS r2,
      sum_x(agg) / num_vals(agg) AS x_mean,
      sum_y(agg) / num_vals(agg) AS y_mean
    FROM (
      SELECT patient_id, metric, rollup(stats) AS agg
      FROM ${table}
      WHERE patient_id IN (${inList(patientIds)}) AND metric IN (${inList(metrics)}) ${sinceClause}
      GROUP BY patient_id, metric
    ) t
  `);
  return groupFitRows(result.rows as BatchFitRow[]);
}

/** `olsFitRawSql`, batched the same way `olsFitBatchSql` batches the continuous-aggregate path (T-012). */
export async function olsFitRawBatchSql(
  db: Db,
  args: { patientIds: readonly string[]; metrics: readonly string[]; sinceMs?: number },
): Promise<Map<string, Map<string, OlsFit>>> {
  const { patientIds, metrics, sinceMs } = args;
  const sinceClause = sinceMs !== undefined ? sql`AND ts >= to_timestamp(${sinceMs / 1000})` : sql``;
  const result = await db.execute(sql`
    SELECT
      patient_id, metric,
      num_vals(agg) AS n,
      slope(agg) AS slope_per_day,
      intercept(agg) AS intercept,
      determination_coeff(agg) AS r2,
      sum_x(agg) / num_vals(agg) AS x_mean,
      sum_y(agg) / num_vals(agg) AS y_mean
    FROM (
      SELECT patient_id, metric, stats_agg(value, extract(epoch FROM ts) / 86400.0) AS agg
      FROM observations
      WHERE patient_id IN (${inList(patientIds)}) AND metric IN (${inList(metrics)}) ${sinceClause}
      GROUP BY patient_id, metric
    ) t
  `);
  return groupFitRows(result.rows as BatchFitRow[]);
}
