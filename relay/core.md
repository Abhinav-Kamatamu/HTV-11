# Relay: core

<!-- Baton for the core lane. Any teammate's Claude session can pick this up with /pickup core.
     Keep sections short. Newest log entry on top. -->

## Status
T-001 done: app scaffolded, `npm run dev/lint/test/build` work. T-002 half done (compose file written, never booted).

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-002 remainder, needs a machine WITH Docker (not the one used so far): `docker compose up db`, `CREATE EXTENSION timescaledb_toolkit`, confirm the volume persists after `down`/`up`, Tiger Cloud project + same extension, share `DATABASE_URL` in team chat.
- T-003: Drizzle schema per ARCHITECTURE.md (+ `flags.points`, `flags.contributions`), migration, hypertable + continuous aggregates, replace the `db:migrate` stub. Can be written without Docker but not verified.
- T-006 (Vultr deploy) is now unblocked.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- Next.js 16 / React 19.3: APIs differ from older docs. Read `node_modules/next/dist/docs/` before writing route handlers (see AGENTS.md).
- `docker` is not installed on the dev machine used for T-001; T-002 verification is still outstanding.
- shadcn's `cn` helper comes from the `cn` npm package (shadcn team's), not clsx/tailwind-merge. That is intended.
- `db:migrate` and `db:seed` are echo stubs; replace them in T-003 / T-004.
- `.gitignore` ignores `next-env.d.ts` and `*.tsbuildinfo`; the create-next-app `.env*` ignore was NOT carried over, so `.env.example` stays tracked.

## Log
<!-- scripts/handoff.sh appends entries here. -->
