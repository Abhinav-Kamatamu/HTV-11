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
