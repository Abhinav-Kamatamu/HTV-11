import { describe, expect, it } from "vitest";
import { aggregateNames, aggregateStatements, refreshStatements } from "./timescale";

// No database here: these only guard the generated SQL's shape. Real verification is
// `npm run db:migrate` against the -ha image (T-002).
describe("timescale statements", () => {
  it("creates one real-time continuous aggregate per bucket, with stats_agg over epoch days", () => {
    const creates = aggregateStatements.filter((s) => s.includes("CREATE MATERIALIZED VIEW"));
    expect(creates).toHaveLength(aggregateNames.length);
    for (const sql of creates) {
      expect(sql).toContain("IF NOT EXISTS");
      expect(sql).toContain("timescaledb.materialized_only = false");
      expect(sql).toContain("stats_agg(value, extract(epoch FROM ts) / 86400.0)");
      expect(sql).toContain("WITH NO DATA");
    }
  });

  it("gives every aggregate a refresh policy and an initial refresh", () => {
    for (const name of aggregateNames) {
      expect(aggregateStatements.some((s) => s.includes(`add_continuous_aggregate_policy('${name}'`))).toBe(true);
      expect(refreshStatements).toContain(`CALL refresh_continuous_aggregate('${name}', NULL, NULL)`);
    }
  });
});
