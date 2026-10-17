# Relay: core

<!-- Baton for the core lane. Any teammate's Claude session can pick this up with /pickup core.
     Keep sections short. Newest log entry on top. -->

## Status
T-001 and T-003 done (T-003 code-complete but UNRUN: no Docker/Postgres on the dev machine). T-002 half done (compose file written, never booted).

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
T-002 on Tiger Cloud only (no local Docker). Plan: (1) connect via DATABASE_URL from .env.local (never print it), `CREATE EXTENSION IF NOT EXISTS timescaledb_toolkit`, confirm `stats_agg` and `heartbeat_agg` exist in pg_proc; (2) update TASKS/DECISIONS/compose notes to "Tiger Cloud only"; (3) then run `npm run db:migrate` against it (T-003 verification) and fix any SQL signature that fails.

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-002 remainder + T-003 verification, on a machine WITH Docker: `docker compose up db`, copy `.env.example` to `.env.local`, `npm run db:migrate` (twice, to prove idempotence), confirm `\d+ observations` shows a hypertable and `SELECT slope(stats_agg) ...` style queries work on `obs_daily`; fix any wrong toolkit/timescale signature in `src/db/timescale.ts`. Then Tiger Cloud project + same extension, share `DATABASE_URL` in team chat.
- T-004: deterministic seed (story patients A/B/C + controls) into `src/db/seed/`; call `refreshStatements` from `src/db/timescale.ts` after loading.
- T-006 (Vultr deploy) is unblocked.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- Next.js 16 / React 19.3: APIs differ from older docs. Read `node_modules/next/dist/docs/` before writing route handlers (see AGENTS.md).
- Schema decisions in DECISIONS.md 03:10: uuid PKs, `patients.synthetic`, `messages.flag_id` NOT NULL, real-time caggs with `stats` = `stats_agg(value, epoch_days)`. Engine lane: T-022's OLS must use the same x (`extract(epoch FROM ts)/86400`).
- Do NOT edit generated files in `src/db/migrations/`; change `schema.ts` and run `npm run db:generate`. Timescale-only SQL goes in `src/db/timescale.ts`.
- `docker` is not installed on the dev machine used for T-001; T-002 verification is still outstanding.
- shadcn's `cn` helper comes from the `cn` npm package (shadcn team's), not clsx/tailwind-merge. That is intended.
- `db:seed` is still an echo stub (T-004). `db:migrate` is real but untested against a database.
- `.gitignore` ignores `next-env.d.ts` and `*.tsbuildinfo`; the create-next-app `.env*` ignore was NOT carried over, so `.env.example` stays tracked.

## Log
<!-- scripts/handoff.sh appends entries here. -->
