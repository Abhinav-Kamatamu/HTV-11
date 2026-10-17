# Relay: core

<!-- Baton for the core lane. Any teammate's Claude session can pick this up with /pickup core.
     Keep sections short. Newest log entry on top. -->

## Status
T-001 to T-005, T-007 to T-012 done and pushed; only T-006 (deploy, on hold — human is
reevaluating Vultr), T-013 and T-014 (both Vultr-dependent, see below) are left in this lane.
Tiger Cloud is the only database (PostgreSQL 18.6, `timescaledb` 2.30.2, `timescaledb_toolkit`
1.26.0). The DB is SEEDED: 25 patients, flags table is populated by running `/api/engine/run`
(empty right after a reseed — that's expected, see seed Gotcha below). SQL slopes per year match
the stories: Priya (A) HbA1c +0.20, Marcus (B) eGFR -5.93 and home BP 141.2/87.7, Daniel (C) ALT
+6.1 and GGT +9.4.

T-012 done (2026-10-17): `/api/benchmark/run`'s 3 vitals-OLS paths now each run as one batched
query instead of 150 (one per patient×metric pair). Live-verified against Tiger Cloud: all three
paths still agree exactly on 12,900 rows (same as before), and timing dropped from ~3.4-3.5s to
~35-47ms each, with the paths now landing in the order the Tiger Data story wants (continuous
aggregate ~34-36ms fastest, raw table ~37-38ms, fetch+pure-TS ~46-58ms slowest) across three
separate runs. See Gotchas for the implementation details.

T-010 built `POST /api/benchmark/run`: three vitals-OLS paths (continuous aggregate `olsFitSql`, new raw-table `olsFitRawSql`, fetch+pure-TS `olsFit`) over `bp_systolic`/`bp_diastolic`/`weight_kg`/`resting_hr`/`steps`/`sleep_hours` (RISK_ENGINE §3b — labs use Mann-Kendall/Sen, not OLS, so they're excluded), plus `listSilenceSql` and a full engine re-run, each timed as median-of-5 via `src/app/api/_lib/benchmark.ts#medianMs`. Live-smoke-tested against Tiger Cloud: all three vitals paths agreed exactly (12,900 rows each) on the 25-patient seed; see Gotchas for timings and why they're dominated by network round trips at this scale.

T-005 built all ten routes from ARCHITECTURE.md §API directly as real (DB + engine + Gemini), skipping the stub phase since the engine/db wiring was already straightforward: `src/app/api/_lib/{http,engine-db,gemini,uploads}.ts` are the shared glue, one `route.ts` per endpoint. Smoke-tested live against Tiger Cloud + real Gemini (see Gotchas) — queue ranking, validate/dismiss/message, and the symptom red-flag path all confirmed working before committing.

## In flight
T-006: Vultr reevaluation is resolved — account made, billing added, instance up in Toronto
(155.138.148.86, Ubuntu 24.04, SSH as root with an ed25519 key, confirmed reachable after two
reinstalls to get the key attached — Vultr's SSH-key picker only applies at deploy/reinstall
time, not retroactively to a running instance, see Gotchas). Scope for this pass: deploy only
(Docker container running on the box, reachable over plain HTTP at the IP) — domain
registration and HTTPS are still deliberately out, per the earlier human decision to split them
off as separate, confirm-first steps. Plan: add `output: "standalone"` to `next.config.ts`,
write a multi-stage Dockerfile + `.dockerignore`, install Docker on the server, ship the repo
+ `.env.local` secrets over (rsync/scp, not git, no GitHub credentials on the box), build and
run the container, decide `UPLOAD_DIR` persistence (bind-mount vs ephemeral) before finishing.

## Next up
- **T-013, T-014 stay on hold** until T-006 (this pass) is actually done and verified reachable.
- **T-013** (new 2026-10-17, core, depends on T-006): nightly scheduled job on the Vultr server
  that re-runs `/api/engine/run` for every patient. Required, not optional — silence detection
  and trend/projection aging are both functions of wall-clock time, not of any ingest event, so
  without this job a patient who stops logging or whose projected crossing date creeps closer
  gets no fresh flag between demos.
- **T-014** (new 2026-10-17, core, optional): move `UPLOAD_DIR` to Vultr Object Storage if a
  Canadian region is available there, so uploads survive a container restart.
- Optional hardening: get Tiger's CA and move to `sslmode=verify-full` (DECISIONS 03:40).

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- **Benchmark batching (T-012, `src/db/vitals.ts`, `src/app/api/benchmark/run/route.ts`)**
  - New `olsFitBatchSql`/`olsFitRawBatchSql` do the same `rollup(stats)`/`stats_agg` math as
    `olsFitSql`/`olsFitRawSql` but take `patientIds`/`metrics` arrays and `GROUP BY patient_id,
    metric` instead of filtering to one pair — one query covers all 150 pairs on the default
    seed. New pure `groupFitRows` (unit-tested, no DB) nests the batched rows into
    `Map<patientId, Map<metric, OlsFit>>`; the route sums `.n` across it for the `rows` count it
    already reported.
  - **Interpolating a JS array directly into a `sql` template does not produce a usable
    `IN (...)` list** — confirmed by actually running it against Tiger Cloud: `WHERE x IN
    (${arr})` compiles to `IN (($1, $2, $3))`, a single row-value tuple, not three elements, and
    the query fails. Same Gotcha `silence.ts`'s `listSilenceSql` already hit for `IN`-lists; a
    new local `inList()` helper in `vitals.ts` builds it by hand (`sql.join(values.map(v =>
    sql\`${v}\`), sql\`, \`)`), same pattern. Don't reach for `= ANY($1::uuid[])` either — that's
    the alternative CLAUDE.md's T-012 wording suggested, but it was never actually tried or
    verified; `IN (...)` built this way is what's confirmed working.
  - The `fetchAndCompute` (pure-TS) path batches the same way but through drizzle's typed
    `inArray()` instead of raw SQL (`WHERE patient_id IN (...) AND metric IN (...)`, one `select`),
    then groups the returned rows by `` `${patientId}\u0000${metric}` `` in JS before calling
    `olsFit` per group — no raw-SQL IN-list gotcha there since `inArray` already handles it
    correctly.
  - Live-verified against Tiger Cloud on the default 25-patient seed, three separate runs: all
    three paths still agree exactly on 12,900 rows (unchanged — batching didn't change what's
    computed, only how many round trips it takes), and timing dropped from ~3.4-3.5s to
    ~34-58ms per path, now ordered the way the Tiger Data story wants it: continuous aggregate
    (~34-36ms) fastest, raw table (~37-38ms) next, fetch+pure-TS (~46-58ms) slowest. T-083
    (pitch) can use these numbers in the Devpost draft instead of the old "within noise" ones.
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
- **Benchmark route (T-010, `src/app/api/benchmark/run/route.ts`, `src/db/vitals.ts#olsFitRawSql`, `src/app/api/_lib/benchmark.ts`)**
  - `olsFitRawSql` is `olsFitSql`'s math (`stats_agg`/`rollup` → `slope`/`intercept`/`determination_coeff`) run straight off `observations` with no continuous aggregate — same `OlsFit` shape, same `mapFitRow`, so no new pure-TS logic needed a test.
  - The three vitals paths are scoped to RISK_ENGINE §3b's OLS metrics only — `bp_systolic`, `bp_diastolic`, `weight_kg`, `resting_hr`, `steps`, `sleep_hours`. HbA1c/fasting glucose/eGFR/ACR are **not** included: those are labs, scored with Mann-Kendall + Sen's slope (§3a, T-027), never computed in SQL, so they're outside this comparison.
  - `medianMs` runs `fn` 5x and returns the middle of the sorted durations, which is also a correctness check for free: if the three paths disagree on row count across runs something is wrong. Live-verified: all three returned exactly 12,900 rows on the 25-patient seed.
  - On the live 25-patient seed, all three vitals paths land within noise of each other (~3.4-3.5s for 150 patient×metric pairs); the silence scan is ~60ms and a full engine re-run is ~2s. At this patient count the loop is dominated by per-call network round trips to Tiger Cloud (150 awaited queries per path), not by which SQL does the computing — the continuous aggregate's real advantage would show up either batched into one query per path, or at `--scale` (T-009 found the full engine re-run take ~78s for 1000 patients vs ~2s for 25, roughly linear). Worth noting in the pitch deck rather than treating the near-equal numbers as a bug.
  - Route writes flags via `runEngineForPatient` same as `/api/engine/run`'s re-run-all (idempotent upsert on `status = 'new'`), so calling it 5x in the demo is safe and doesn't churn flag ids.
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
