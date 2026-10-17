// Timescale / Tiger Data objects that drizzle-kit cannot express. Applied by src/db/migrate.ts,
// one statement at a time and outside a transaction (continuous aggregates and CALL cannot run
// inside one). Every statement is idempotent, so `npm run db:migrate` is safe to re-run.
//
// Function signatures to verify against the toolkit docs in T-002/T-007 (written without a
// running database): stats_agg(y, x), time_bucket, add_continuous_aggregate_policy.

export const extensionStatements = [
  "CREATE EXTENSION IF NOT EXISTS timescaledb",
  "CREATE EXTENSION IF NOT EXISTS timescaledb_toolkit",
];

export const hypertableStatements = [
  `SELECT create_hypertable('observations', 'ts',
     chunk_time_interval => INTERVAL '30 days',
     if_not_exists => TRUE, migrate_data => TRUE)`,
];

// One aggregate per bucket width, each built straight from raw observations. `stats` holds
// stats_agg(value, epoch_days) so slope, R² and intercept come from rollup() over any window
// (RISK_ENGINE §8). Real-time (materialized_only = false) so a fresh ingest shows up at once.
function continuousAggregate(name: string, bucket: string): string {
  return `CREATE MATERIALIZED VIEW IF NOT EXISTS ${name}
    WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
    SELECT
      patient_id,
      metric,
      time_bucket(INTERVAL '${bucket}', ts) AS bucket,
      avg(value) AS avg_value,
      min(value) AS min_value,
      max(value) AS max_value,
      count(*) AS n,
      stats_agg(value, extract(epoch FROM ts) / 86400.0) AS stats
    FROM observations
    GROUP BY patient_id, metric, time_bucket(INTERVAL '${bucket}', ts)
    WITH NO DATA`;
}

export const aggregateNames = ["obs_daily", "obs_weekly", "obs_monthly"] as const;

export const aggregateStatements = [
  continuousAggregate("obs_daily", "1 day"),
  continuousAggregate("obs_weekly", "1 week"),
  continuousAggregate("obs_monthly", "1 month"),
  ...aggregateNames.map(
    (name) => `SELECT add_continuous_aggregate_policy('${name}',
      start_offset => NULL, end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour', if_not_exists => TRUE)`,
  ),
];

// Call after bulk loads (the seed) so the aggregates cover historical rows immediately.
export const refreshStatements = aggregateNames.map(
  (name) => `CALL refresh_continuous_aggregate('${name}', NULL, NULL)`,
);
