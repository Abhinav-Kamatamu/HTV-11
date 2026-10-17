# Relay: core

<!-- Baton for the core lane. Any teammate's Claude session can pick this up with /pickup core.
     Keep sections short. Newest log entry on top. -->

## Status
T-001 to T-004 done and pushed (lane has nothing in flight). Tiger Cloud is the only database (PostgreSQL 18.6, `timescaledb` 2.30.2, `timescaledb_toolkit` 1.26.0). The DB is now SEEDED (run 2026-10-17, twice, idempotent): 24 patients, 13,634 observations, 101 lab reports, 20 meals, 12 symptom logs, 0 flags; `obs_daily/weekly/monthly` refreshed. SQL slopes per year match the stories: Priya (A) HbA1c +0.20, Marcus (B) eGFR -5.93 and home BP 141.2/87.7, Daniel (C) ALT +6.1 and GGT +9.4.

## In flight
(none)

## Next up
- **T-005** API routes (stubs first, then real; read `node_modules/next/dist/docs/` first), or **T-007** SQL vitals math (the seed now has data to verify against; use `epoch_days = ts_ms / 86400000`). T-009 (scale mode) and T-011 (extend the seed) also unblocked.
- **T-011 leftovers:** `hdl`, `neck_cm`, weekly `sleep_*` check-ins, a step change in Patient B's home BP (the seed BP is flat at 141/88 for now), Patient C 3 criteria met + 2 unknown, one silent patient (every seed patient currently logs through yesterday).
- Optional hardening: get Tiger's CA and move to `sslmode=verify-full` (DECISIONS 03:40).

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- (engine lane touched `src/db/seed/generate.ts` + test on 2026-10-17) T-011 is DONE (DECISIONS 05:10 and 06:00): story patients A/B/C have six twice-yearly labs (`labIntervalDays`), HDL, neck_cm, weekly sleep check-ins, `intake.height_cm`/`medications`, noise only on controls. B's home BP steps ~126/78 to ~141/88 at 42 days ago; patient 25 Rosa Delgado went silent 11 days ago. DB re-seeded (25 patients, 15,247 observations).
- **Seed (`src/db/seed/`)**
  - `npm run db:seed` (`--dry-run`, `--anchor YYYY-MM-DD`). Shared DB: announce before running. It deletes only rows whose uuid starts `5eed` (plus `source = 'synthetic'` observations of those patients), upserts patients, then refreshes the aggregates. Flags and messages on seed patients ARE deleted on reseed (engine output); rows from real use survive.
  - Fixed ids in `ids.ts` (`STORY_IDS`: A `5eed0002-...-001`, B `...002`, C `...003`, urgent `...004`). Timestamps are relative to the anchor (midnight UTC today): vitals are the 90 days ending yesterday, so after a day or two rerun the seed to keep "recent" data recent.
  - Metric names/units: `UNITS` in `generate.ts` and DECISIONS 04:10. `symptom_logs.codes` hold placeholder strings (`thirst`, `fatigue`, `nocturia`, `edema`, `headache`, `chest_pain`, `dyspnea`); T-023 may want to rename them.
  - Patient A: Priya Nair, B: Marcus Webb, C: Daniel Okafor, urgent: Walter Hughes. 20 controls, the last 3 drift slowly.
- **Tiger Cloud connection**
  - One shared service for the whole team. `DATABASE_URL` lives in `.env.local` (git-ignored), shared in team chat. Never print or commit it, and don't `cat`/grep that file; load it with `node --env-file-if-exists=.env.local` or `tsx --env-file-if-exists=.env.local`.
  - node-pg treats `sslmode=require` as verify-full and fails with `SELF_SIGNED_CERT_IN_CHAIN` on Tiger Cloud. `src/db/client.ts` appends `uselibpqcompat=true` automatically. Any ad hoc script that builds its own `pg` client must do the same. Redact the host from error output.
  - `db:migrate` and `db:seed` affect everyone. Announce before reseeding or changing the schema.
- **Migrations**
  - Never edit files in `src/db/migrations/` by hand. Change `src/db/schema.ts`, run `npm run db:generate`, then `npm run db:migrate`.
  - Timescale-only SQL (extensions, hypertable, continuous aggregates, policies) goes in `src/db/timescale.ts`, one idempotent statement per entry. `migrate.ts` runs them outside a transaction, in this order: extensions, drizzle migrations, hypertable, aggregates, initial refresh. Continuous aggregates and `CALL` cannot run in drizzle's migration transaction.
  - `observations` has no primary key (a hypertable unique index must include `ts`). `value` is double precision. FKs from it to `patients` work.
  - Schema choices (DECISIONS 03:10): uuid PKs, `patients.synthetic`, `messages.flag_id` NOT NULL. Aggregates are real-time (`materialized_only = false`) and built from raw `observations`, not hierarchical.
- **Toolkit functions (confirmed present on Tiger Cloud, signatures read from `pg_proc`)**
  - `stats_agg(y double precision, x double precision)`. Our aggregates store it as the `stats` column with `x = extract(epoch FROM ts) / 86400.0` (epoch days).
  - Read it with `slope(rollup(stats))`, `intercept(rollup(stats))`, `determination_coeff(rollup(stats))`; `x_intercept(summary statssummary2d)` also exists. Verified on 30 daily BP points: matches a hand OLS to ~1e-13. Crossing day = `(threshold - intercept) / slope` (epoch days); T-007 should record which form it uses in DECISIONS.
  - `heartbeat_agg(heartbeat timestamptz, agg_start timestamptz, agg_duration interval, heartbeat_liveness interval)` and `dead_ranges(agg heartbeatagg)`. Probe worked: it also reports the gap from window start to the first heartbeat as a dead range, so T-008 must ignore or trim that leading range. `rollup(heartbeatagg)` exists for per-day to window rollups.
  - Query `obs_*` through `rollup(stats)` grouped by patient and metric; the `stats` column is not meaningful on its own.
- Next.js 16 / React 19.3: APIs differ from older docs. Read `node_modules/next/dist/docs/` before writing route handlers (see AGENTS.md).
- Engine lane: T-022's OLS must use the same x as above.
- shadcn's `cn` helper comes from the `cn` npm package (shadcn team's), not clsx/tailwind-merge. That is intended.
- `.gitignore` ignores `next-env.d.ts` and `*.tsbuildinfo`; the create-next-app `.env*` ignore was NOT carried over, so `.env.example` stays tracked.

## Log
<!-- scripts/handoff.sh appends entries here. -->
