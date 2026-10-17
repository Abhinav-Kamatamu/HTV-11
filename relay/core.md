# Relay: core

<!-- Baton for the core lane. Any teammate's Claude session can pick this up with /pickup core.
     Keep sections short. Newest log entry on top. -->

## Status
T-001, T-002, T-003 done and pushed (lane has nothing in flight). The app is scaffolded (Next.js 16, Tailwind, shadcn, Vitest, ESLint). Tiger Cloud is the only database (no Docker): `timescaledb` 2.30.2 and `timescaledb_toolkit` 1.26.0 on PostgreSQL 18.6, schema migrated, hypertable and `obs_daily/weekly/monthly` created and verified (SQL slope/R²/crossing match a hand OLS). `db:seed` is still a stub, so the database has tables but no data.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
**T-004** deterministic seed (claimed 2026-10-17).
- Plan: `src/db/seed/` = `rng.ts` (seeded mulberry32), `patients.ts` (fixed uuids for A/B/C + urgent case), `generate.ts` (pure row generators), `index.ts` (runner); `db:seed` runs it via tsx.
- Wipe is scoped to seed data only (`source = 'synthetic'` observations, seed patients' fixed ids/`synthetic = true`), then insert, then `refreshStatements`.
- STATUS: code written, tested and pushed (53f57ae). Remaining: one real `npm run db:seed` against Tiger Cloud (announce to team first), spot-check row counts/slope, then mark T-004 done.
- Metric names are snake_case (hba1c, egfr, acr, bp_systolic, ...); log in DECISIONS. Tests: determinism + Patient A HbA1c ends 5.5, 5.7, 5.9. Don't run against the shared DB until the human says so.

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- **T-004 (start here):** deterministic seed in `src/db/seed/`, wired to `npm run db:seed` (replace the echo stub in package.json, run with `tsx --env-file-if-exists=.env.local`). Story patients A/B/C with FIXED uuids, plus ~20 controls and one urgent case, per ARCHITECTURE.md "Synthetic data" and SPEC §6. Seeded RNG so everyone gets identical data. Every observation `source = 'synthetic'`, patients `synthetic = true`.
  - Make it wipe-and-reload idempotent (delete the seed's rows in FK order, then insert); the DB is shared, so tell the team before running it.
  - After loading call `refreshStatements` from `src/db/timescale.ts` so `obs_daily/weekly/monthly` cover historical rows.
  - Patient A needs at least 6 HbA1c points ending 5.5, 5.7, 5.9 (T-011 extends the seed later with TG, HDL, waist, neck, sleep, a BP step change, a silent patient).
  - Use the same x for any TS OLS check: `epoch_days = ts_ms / 86400000`.
- Then: T-005 (API routes, stubs first), T-006 (Vultr deploy), T-007 (SQL vitals math; the proof query already worked, see Gotchas), T-009 and T-011 after T-004.
- Optional hardening: get Tiger's CA and move to `sslmode=verify-full` (DECISIONS 03:40).

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
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
