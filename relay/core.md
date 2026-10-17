# Relay: core

<!-- Baton for the core lane. Any teammate's Claude session can pick this up with /pickup core.
     Keep sections short. Newest log entry on top. -->

## Status
T-001, T-002, T-003 done. Tiger Cloud is the only database (no Docker); the T-003 migration has been run against it and verified.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-004: deterministic seed (story patients A/B/C + controls) in `src/db/seed/`, wired to `npm run db:seed`; call `refreshStatements` from `src/db/timescale.ts` after loading. The DB is shared: make the seed wipe-and-reload idempotent and tell the team before running it.
- T-005 (API routes) and T-006 (Vultr deploy) are unblocked.
- Optional hardening: get Tiger's CA and move to `sslmode=verify-full` (see DECISIONS 03:40).

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- Next.js 16 / React 19.3: APIs differ from older docs. Read `node_modules/next/dist/docs/` before writing route handlers (see AGENTS.md).
- Schema decisions in DECISIONS.md 03:10: uuid PKs, `patients.synthetic`, `messages.flag_id` NOT NULL, real-time caggs with `stats` = `stats_agg(value, epoch_days)`. Engine lane: T-022's OLS must use the same x (`extract(epoch FROM ts)/86400`).
- Do NOT edit generated files in `src/db/migrations/`; change `schema.ts` and run `npm run db:generate`. Timescale-only SQL goes in `src/db/timescale.ts`.
- No local DB, no Docker. Everyone shares one Tiger Cloud service via `DATABASE_URL` in `.env.local` (never print or commit it; don't `cat`/grep that file). `db:migrate` and `db:seed` hit the shared DB.
- node-pg needs `uselibpqcompat=true` for Tiger Cloud's cert chain; `src/db/client.ts` adds it automatically.
- shadcn's `cn` helper comes from the `cn` npm package (shadcn team's), not clsx/tailwind-merge. That is intended.
- `db:seed` is still an echo stub (T-004). `db:migrate` is real and verified (idempotent).
- `.gitignore` ignores `next-env.d.ts` and `*.tsbuildinfo`; the create-next-app `.env*` ignore was NOT carried over, so `.env.example` stays tracked.

## Log
<!-- scripts/handoff.sh appends entries here. -->
