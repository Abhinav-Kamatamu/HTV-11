# Relay: core

<!-- Baton for the core lane. Any teammate's Claude session can pick this up with /pickup core.
     Keep sections short. Newest log entry on top. -->

## Status
T-001 to T-005, T-007 to T-009 done and pushed. Tiger Cloud is the only database (PostgreSQL 18.6, `timescaledb` 2.30.2, `timescaledb_toolkit` 1.26.0). The DB is SEEDED: 25 patients, flags table is populated by running `/api/engine/run` (empty right after a reseed — that's expected, see seed Gotcha below). SQL slopes per year match the stories: Priya (A) HbA1c +0.20, Marcus (B) eGFR -5.93 and home BP 141.2/87.7, Daniel (C) ALT +6.1 and GGT +9.4.

T-005 built all ten routes from ARCHITECTURE.md §API directly as real (DB + engine + Gemini), skipping the stub phase since the engine/db wiring was already straightforward: `src/app/api/_lib/{http,engine-db,gemini,uploads}.ts` are the shared glue, one `route.ts` per endpoint. Smoke-tested live against Tiger Cloud + real Gemini (see Gotchas) — queue ranking, validate/dismiss/message, and the symptom red-flag path all confirmed working before committing.

## In flight
- **T-010** `POST /api/benchmark/run`. Plan:
  1. `src/db/vitals.ts`: add `olsFitRawSql` — same `stats_agg`/`rollup` math as `olsFitSql` but aggregated
     directly from `observations` (no continuous aggregate), same `OlsFit` return shape.
  2. `src/app/api/_lib/benchmark.ts`: timing harness (run fn 5x, return median ms) used by the route.
  3. `src/app/api/benchmark/run/route.ts`: POST, no body. Times the three vitals paths (continuous
     aggregate / raw table / `loadPatientRecord` + pure-TS `olsFit`) over the trend-flag metrics
     (HbA1c, fasting glucose, eGFR, home BP) for all patients, plus `listSilenceSql` standalone and a
     full engine re-run (`runEngineForPatient` over all patients) standalone. Returns patient count,
     row count, ms per path — nothing hard-coded.
  4. Tests for the median helper (pure). `npm run lint && npm test` before pushing.

## Next up
- **T-010** benchmark page API (`POST /api/benchmark/run`) — T-007/T-008/T-009 all done, so this is unblocked (also needs engine's T-024, done). The three paths to compare are already built: `src/db/vitals.ts` (continuous aggregate), a raw-`observations` version of the same query (not yet written — needed for the "no aggregate" path), and plain TS (`src/engine/trends.ts`/`loadPatientRecord`'s fetch-and-compute). `src/db/silence.ts` is the silent-patient-scan path already.
- **T-006** deploy to Vultr: `UPLOAD_DIR` files aren't served back yet (no `GET /api/uploads/:file`); decide before deploy whether uploads need to survive a container restart (volume mount) or just need to exist long enough for the demo.
- **T-011 leftovers:** `hdl`, `neck_cm`, weekly `sleep_*` check-ins, a step change in Patient B's home BP (the seed BP is flat at 141/88 for now), Patient C 3 criteria met + 2 unknown, one silent patient (every seed patient currently logs through yesterday).
- Optional hardening: get Tiger's CA and move to `sslmode=verify-full` (DECISIONS 03:40).

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- **Scale mode (T-009, `src/db/seed/{generate,copy,index}.ts`)**
  - `npm run db:seed -- --scale 1000` (or any N >= 4). `generateScaleProfiles(scale)` keeps STORY_PROFILES (A/B/C/urgent) fixed and fills the rest from `ARCHETYPE_MIX` (70/15/5/5/5: stable/slow_drift/rapid_decline/silent/metabolic_cluster) via deterministic cumulative-share bucketing, own RNG namespace (10000s/20000s) so it never shifts the default ~25-patient draws.
  - Observations go through a real `COPY FROM STDIN` (`src/db/seed/copy.ts`, new dep `pg-copy-streams`) outside the main transaction — COPY needs a dedicated checked-out client, not the `Pool`/a drizzle `tx`. The default (no `--scale`) path is untouched (still the old chunked INSERT inside the transaction).
  - Live-verified at `--scale 1000` against Tiger Cloud: 1,000 patients / 604,528 observations (~77s to seed), `db:verify-silence` and `db:verify-vitals` both 100% (1000/1000, 6000/6000), full engine re-run ~78s for all 1000, queue read ~250ms, severity mix 739 none / 104 monitor / 156 review / 1 urgent. **Reseeded back to the default ~25 afterward and re-ran the engine** — if you run `--scale` again for T-010 work, do the same before anyone else needs the demo dataset back.
  - `rapid_decline`'s `targetEgfr` is oldest-first, decline applied forward from index 0 (`startEgfr - declinePerYear*intervalYears*i`) — an inverted first draft had zero decline on the most recent reading; the new scale-mode tests in `generate.test.ts` caught it.
- **Silent patients (T-008, `src/db/silence.ts`)**
  - **`dead_ranges()`'s `start` is `lastHeartbeat + heartbeat_liveness`, not `lastHeartbeat`.** The toolkit only calls a patient "dead" once the full liveness grace period has elapsed, so the reported gap starts later than the real last reading by exactly `heartbeat_liveness`. `listSilenceSql` subtracts `SILENCE.quietDays` back out — found by running it against Rosa Delgado's real data (her gap looked like it started 7 days after her actual last reading, with `daysSince` off by exactly 7). Not in `pg_proc`'s signatures; only shows up by actually running it. **If you query `dead_ranges()` directly for anything else, remember this offset.**
  - `heartbeat_agg`'s window is each patient's own `min(ts)` to `now` (not a fixed width) so there's no leading dead-range to trim — the window is the patient's whole history.
  - `activeDays` is a plain `count(DISTINCT floor(epoch_day))` over a handful of candidates (those whose gap already reaches `now`), not a toolkit accessor — toolkit only answers "is there a gap", not "how many days were active".
  - `listSilenceSql(db, now)` returns `Map<patientId, Silence>` for every *currently* silent patient. `loadPatientRecord`/`runEngineForPatient` take an optional `silence` override (4th arg) so `/api/engine/run`'s "re-run all" does one batched scan instead of 25+ individual pure-TS derivations; single-patient calls (ingest routes) still use the pure fallback, which is already cheap since they already have that patient's raw observations in hand.
  - Verified via `npm run db:verify-silence` (`scripts/verify-silence-sql.ts`, not in `npm test`): 25/25 seed patients match `detectSilence` exactly.
- **Vitals SQL (T-007, `src/db/vitals.ts`)**
  - `olsFitSql(db, {patientId, metric, aggregate?, sinceMs?})` returns the exact `OlsFit` shape from `src/engine/trends.ts`, computed via `rollup(stats)` + `slope()`/`intercept()`/`determination_coeff()`/`sum_x()`/`sum_y()`/`num_vals()` over `obs_daily` (default) or `obs_weekly`/`obs_monthly`. Reuse `trends.ts`'s own `slopePerYear`/`crossingDays` on the result rather than reimplementing — that's the point of matching the shape.
  - Crossing day = `(threshold − intercept()) / slope()`, converted from an absolute epoch day to "days from now" exactly like `crossingDays()` does (`− now/DAY_MS`); chose this over `x_intercept()` since it needs no second `value − threshold` aggregate (DECISIONS 2026-10-17).
  - Verified via `npm run db:verify-vitals` (`scripts/verify-vitals-sql.ts`, not part of `npm test` — same no-DB-in-the-suite convention as `timescale.test.ts`): 150/150 patient × vitals-metric pairs matched the pure-TS OLS exactly on the live seed.
  - `determination_coeff()` is null when a series has no variance; `mapFitRow` maps that to `r2 = 1` to match `olsFit`'s `syy === 0` branch.
- **API routes (T-005, `src/app/api/`)**
  - Shared lib in `src/app/api/_lib/`: `http.ts` (`ok`/`parseJson`/`withErrors`/`ApiError`), `engine-db.ts` (every DB+engine query/mutation the routes use — `loadPatientRecord`, `runEngineForPatient`, `listQueue`, `getPatientSummary`, `validateFlag`, `dismissFlag`, `createMessageForFlag`, `requirePatient`), `gemini.ts` (lazy `getGeminiClient()`, throws a 503 `ApiError` if `GEMINI_API_KEY`/`GEMINI_MODEL` aren't set rather than crashing route load), `uploads.ts` (`readUploadedFile` writes to `UPLOAD_DIR`, returns `{storedPath, base64, mimeType}`).
  - `/api/engine/run` upserts flags by `(patientId, condition)` among `status = 'new'` rows (same id kept, so the clinician UI doesn't churn on re-run); a condition that stops firing is left alone, not auto-resolved (DECISIONS 2026-10-17). Every ingest route (`meal`/`device`/`labs`/`symptom`) calls it after writing, per ARCHITECTURE.md ("Engine runs on every ingest").
  - `GET /api/clinician/patients` reads **persisted** flags (fast; no live engine run) — call `/api/engine/run` first to pick up new readings. It also force-ranks a patient to `urgent` if `symptom_logs.red_flag` fired in the last `SYMPTOM_PARAMS.redFlagActiveDays` days, since red flags never get a `flags` row (RISK_ENGINE §7).
  - `GET /api/patients/:id/summary` returns persisted flags (their `contributions`/`evidence` already carry the trend math) plus recent meals/symptom_logs/lab_reports/observations (capped, newest first) — no live recompute.
  - `POST /api/flags/:id/validate { note, message }`: `createMessageForFlag` refuses (409) unless the flag's status is already `validated` (CLAUDE.md §4: only a validated flag can message the patient); the route sets status first, so this only matters if something calls the lib function directly.
  - Meal macros (kcal/carbs_g/protein_g/fat_g/fibre_g/sodium_mg) ARE written to `observations` with `source = 'meal_photo'`, confidence from the extraction — RISK_ENGINE §1 says low-confidence extractions "can feed trends", and the schema's `observation_source` enum already expects it, even though no scoring layer reads them yet.
  - Uploaded files land in `UPLOAD_DIR` (default `./uploads`, gitignored) but there is no route to serve them back yet (`GET /api/uploads/:file` doesn't exist) — fine for ingest, a gap before anything needs to display the original photo.
  - Smoke-tested live against Tiger Cloud + the real Gemini key: `/api/engine/run` (all 25 patients → matches the story severities), symptom ingest incl. the chest-pain red-flag path, validate+message, dismiss. Any test data created this way was deleted afterward and the engine re-run to restore clean story flags — do the same if you smoke-test against the shared DB again.
- (engine lane touched TASKS.md T-008 on 2026-10-17) T-008's silent-patient query must match the engine's `detectSilence` in `src/engine/silence.ts`, with a SQL-vs-engine parity test over all seed patients (team decision, DECISIONS 2026-10-17). The leading dead range from the window start must be trimmed, as noted below.
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
  - T-005 added two more (both additive, already migrated on Tiger Cloud, DECISIONS 2026-10-17): `flags.label text` (nullable) and `flags.points` changed `integer` → `real` (ledger totals can be fractional, e.g. the symptom layer's half-points).
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
