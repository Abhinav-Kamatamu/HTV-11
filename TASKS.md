# Tasks

Status: `todo` · `doing` · `done` · `blocked`. Claim a task by setting `doing` + your lane and
pushing (see CLAUDE.md §2). One `doing` task per lane at a time.

## Lanes

| Lane | Owns | Teammate (fill in) |
|---|---|---|
| core | `src/app/api`, `src/db`, deploy | |
| engine | `src/engine`, `src/ai` | |
| clinician | `src/app/(clinician)` | |
| patient | `src/app/(patient)` | |
| pitch | `docs/`, `pitch/`, Devpost, DEV post | (rotates) |
| lab | `src/lab`, `src/app/(clinician)/lab` (stretch, gated — see Board) | |

## Board

| ID | Lane | Task | Status | Depends on |
|---|---|---|---|---|
| T-001 | core | Scaffold Next.js + TS + Tailwind + shadcn + Vitest + ESLint, `npm run dev/lint/test` work | done | |
| T-002 | core | Tiger Cloud only, no local Docker: Tiger Cloud service created, `timescaledb_toolkit` 1.26.0 confirmed there (`stats_agg`, `heartbeat_agg`, `dead_ranges`, `x_intercept` present), `DATABASE_URL` shared in team chat (not git) and set in each teammate's `.env.local` | done | |
| T-003 | core | Drizzle schema per ARCHITECTURE.md plus `flags.points int` and `flags.contributions jsonb` (RISK_ENGINE §7), migration, hypertable + continuous aggregates, `npm run db:migrate` | done | T-001 T-002 |
| T-004 | core | Deterministic seed generator with story patients A/B/C + controls, `npm run db:seed` | done | T-003 |
| T-005 | core | Ingest + clinician + flags API routes (stubs first, then real) | done | T-003 |
| T-006 | core | Deploy to a Vultr instance in the Toronto region (patient data stays in Canada) | done | T-001 |
| T-015 | core | Register the GoDaddy Registry domain and point it at the Vultr deploy (T-006) with HTTPS (currently plain HTTP at the bare IP) | todo | T-006 |
| T-007 | core | Tiger Data vitals math (RISK_ENGINE §8): `stats_agg(value, epoch_days)` in `obs_daily`/`obs_weekly`, SQL for slope, R² and threshold crossing (`x_intercept` or `(threshold - intercept)/slope`, record which in DECISIONS). Verify toolkit function signatures. Test: SQL output equals a pure-TS OLS on the seed vitals | done | T-003 T-004 |
| T-008 | core | Silent patients: `heartbeat_agg` per patient per day, query for patients active in the prior 30 days with no heartbeat for 7+ days (`dead_ranges`), exposed to the engine and the queue API. Must agree with the engine's pure `detectSilence` (`src/engine/silence.ts`, DECISIONS 2026-10-17): silent = last daily-vitals reading (bp, weight, hr, steps, sleep hours; not labs) ≥ 7 calendar days ago AND readings on ≥ 15 of the 30 days ending on it; add a parity test (SQL vs `detectSilence`) over all seed patients; on the default seed only patient 25 is silent (daysSince 11, activeDays 30) | done | T-007 |
| T-009 | core | Scale mode: `npm run db:seed -- --scale 1000`, same seeded RNG, A/B/C keep fixed ids, archetype mix per RISK_ENGINE §9, `COPY` inserts, all rows `synthetic`. Default seed stays ~25 patients | done | T-004 |
| T-010 | core | `POST /api/benchmark/run`: median of 5 warm runs for the three paths (continuous aggregate, raw table, fetch + compute in TS) on slope/R²/crossing for all patients, the silent-patient scan, and a full engine re-run. Returns patient count, row count and ms; nothing hard-coded | done | T-007 T-008 T-009 T-024 |
| T-011 | core | Extend the seed for the new layers: triglycerides, HDL, waist, neck circumference, weekly sleep check-ins, a step change in Patient B's home BP (for CUSUM), Patient C with 3 metabolic criteria met and 2 unknown, one silent patient, Patient A keeps six twice-yearly HbA1c points, 4.65 to 5.4. DONE on 2026-10-17 (engine lane, see DECISIONS 05:10): HDL, neck_cm, weekly sleep check-ins, C 3 of 5 with 2 unknown, B STOP-Bang 7. Also done (06:00): B's home BP step change 42 days ago and silent patient 25 (Rosa Delgado) | done | T-004 |
| T-020 | engine | Verify every threshold in RISK_ENGINE.md §2 against the source (including metabolic syndrome cutoffs with Canadian waist values, STOP-Bang bands, Mann-Kendall/Sen/CUSUM references), write `sources.ts` with URLs | done | |
| T-021 | engine | `scores.ts`: CANRISK, FIB-4, FLI, home BP average, eGFR/ACR staging + tests | done | T-020 |
| T-022 | engine | `trends.ts`: OLS slope for vitals (mirrors the SQL in T-007), baseline z-score, projected crossing helper + tests. Lab trends are T-027 | done | T-001 |
| T-023 | engine | `symptoms.ts`: code list, weights, decayed cluster score, red-flag list + tests | done | T-001 |
| T-024 | engine | `flags.ts`: turn the points ledger into Flag objects (severity bands, `kind` = biggest contributor), ranking function + tests | done | T-021 T-022 T-023 T-031 |
| T-025 | engine | `ai/gemini.ts` + zod schemas: extractMeal, extractDevice, extractLabs (incl. triglycerides, HDL), codeSymptoms | done | T-001 |
| T-026 | engine | `explainFlag` (takes the ledger, may not change points, cites only sources on the rows) + `visitSummary` restricted to sources.ts | done | T-024 T-025 |
| T-027 | engine | `labtrend.ts`: Mann-Kendall (exact p for n ≤ 10, tie-corrected normal above), Sen's slope and intercept, 90% slope interval, crossing date with range, gate (n ≥ 4, p < 0.10). Known-answer tests: monotone series give p = 2/n! (n=3: 0.333, n=4: 0.083, n=5: 0.017) | done | T-001 |
| T-028 | engine | `changepoint.ts`: tabular CUSUM on daily vitals (28-day reference, k = 0.5, h = 5, skip missing days, re-baseline after alarm), returns change date and shift size + tests incl. a no-change series that must not alarm | done | T-001 |
| T-029 | engine | `cooccurrence.ts`: metabolic syndrome 3-of-5 with met/not met/unknown per criterion, treatment counts as met, sex-specific cutoffs + tests | done | T-020 |
| T-030 | engine | `stopbang.ts`: score from sleep check-in answers + record (age, sex, BMI, neck, treated BP), lower-bound handling for missing items, 90-day freshness + tests | done | T-020 |
| T-031 | engine | `points.ts`: Contribution type, point values, per-layer cap of 4, severity bands, reason templates (engine-written, not Gemini), `gap` layer fed by T-008 and stale-trend marking + tests that the three story patients land in the SPEC §6 severities | done | T-021 T-022 T-023 T-027 T-028 T-029 T-030 |
| T-040 | clinician | Role switcher + layout shell | done | T-001 |
| T-041 | clinician | Patient queue sorted by risk, severity filter (mock data until T-005) | done | T-040 |
| T-042 | clinician | Patient detail: lab trend charts with projection line + threshold bands | done | T-040 |
| T-043 | clinician | Flag card with "why" panel, evidence list, citations, validate/dismiss | done | T-042 |
| T-044 | clinician | Visit prep summary view | done | T-026 |
| T-045 | clinician | Why panel renders the points ledger: one row per contribution with layer, +points, reason, citation, and the total next to the severity. Label "priority points" | done | T-043 T-031 |
| T-046 | clinician | Chart additions: Sen projection with crossing-range band on lab charts, CUSUM change-point marker on vitals, metabolic syndrome 3-of-5 chips with unknowns, STOP-Bang line | done | T-042 T-027 T-028 T-029 T-030 |
| T-047 | clinician | "Stopped logging" badge and filter in the patient queue, stale-trend label on charts | done | T-041 T-008 |
| T-048 | clinician | `/benchmark` page (labeled "Synthetic scale test"): run button, patient and row counts, median ms per path as a bar chart, run timestamp | done | T-040 T-010 |
| T-060 | patient | Patient home: timeline + messages | done | T-040 |
| T-061 | patient | Camera upload for meal + device photo with result preview | done | T-060 |
| T-062 | patient | Symptom chat (with red-flag "seek care now" response) | done | T-060 |
| T-063 | patient | Lab report upload | done | T-061 |
| T-064 | patient | Weekly sleep check-in: three yes/no taps (snoring, tired, observed apnea) plus optional hours slept, neck circumference asked once; writes observations per RISK_ENGINE §1. Fixed form, no Gemini | done | T-060 |
| T-080 | pitch | Devpost draft, architecture diagram, 3-min demo script rehearsal | doing | |
| T-081 | pitch | DEV.to write-up (MLH DEV prize) | done | |
| T-082 | pitch | Demo props: printed BP monitor photo, sample lab PDF, backup screen recording | todo | |
| T-083 | pitch | Rehearse the 6-beat demo in SPEC §6 (ledger why panel, CUSUM marker, metabolic 3-of-5, `/benchmark`), put the measured benchmark numbers and the Tiger Data story (`stats_agg`, `heartbeat_agg`, continuous aggregates) in the Devpost draft | todo | T-048 |
| T-012 | core | `/api/benchmark/run`'s 3 vitals-OLS paths land within noise of each other on the live 25-patient seed (~3.4-3.5s each) — relay/core.md Gotchas (T-010) already diagnosed this as 150 sequential awaited round trips to Tiger Cloud per path dominating over actual query-plan cost, not a bug, and named the fix: batch each path into one query per path (e.g. `WHERE patient_id = ANY($1) AND metric = ANY($2)`, grouped) instead of a per-patient-per-metric loop, so the continuous aggregate's real advantage shows up live at demo scale instead of only at `--scale`. T-083 (pitch) needs real numbers either way | done | T-010 |
| T-013 | core | Nightly scheduled job on the Vultr server that re-runs the engine for every patient and writes flags. Needed because silence detection (`heartbeat_agg`) and trend/projection aging are functions of wall-clock time, not of any ingest event, so without a scheduled run a patient who goes quiet or whose projected threshold crossing creeps closer gets no fresh flag until they happen to log something else | done | T-005 T-006 |
| T-014 | core | Optional: move `UPLOAD_DIR` to Vultr Object Storage if a Canadian region is available, so uploaded meal/device/lab files survive a container restart without a bind mount | todo | T-006 |
| T-032 | engine | Stretch: load the guideline excerpts behind `sources.ts` into a Vultr Serverless Inference vector store collection so the why panel can retrieve and show the exact guideline passage next to each citation, not just a name + link. Credit gate cleared 2026-10-17 (DECISIONS.md) — before building, still need to check where it processes data (only the public guideline text should ever be embedded, never patient data) | todo | T-020 |
| T-090 | lab | **Stretch, gated: do not start before the main demo flow works end-to-end (SPEC §6 beats rehearsed, T-083).** Papiers autoresearch challenge, part 1: give the `--scale` seed (T-009) hidden ground-truth labels — which patients cross a diagnostic threshold within N months of the anchor — that the engine itself is never shown. Build a cutoff-date view of that cohort so a harness run only sees observations/labs/symptom logs with `ts <= cutoff`, never the label or anything after it | todo | T-009 |
| T-091 | lab | Stretch, gated (see T-090). Papiers challenge, part 2: evaluation harness — run a given engine config against the cutoff-date cohort (T-090) and score its flags against the hidden labels: sensitivity (crossers who got flagged before crossing), false-alarm rate (non-crossers flagged), median lead time (days between flag and actual crossing for true positives), flags per 100 patients. Write each run to an experiment log (config used, metrics, timestamp) | todo | T-090 T-031 |
| T-092 | lab | Stretch, gated (see T-090). Papiers challenge, part 3: Gemini autoresearch agent loop — reads the experiment log (T-091) and the clinician-feedback panel (T-093), proposes one hypothesis plus exactly one engine-config change, runs it (T-091), logs the result, and proposes the next step. Every proposal must cite which specific clinician-feedback entry (if any) influenced it; when two configs trade off against each other (e.g. sensitivity vs. false-alarm rate) it must stop and ask the clinician rather than pick for them | todo | T-091 T-025 |
| T-093 | lab | Stretch, gated (see T-090). Papiers challenge, part 4: lab UI at `src/app/(clinician)/lab` — experiment timeline, a metrics chart across runs, config diffs between consecutive runs, a clinician-feedback panel (write feedback, see history), and human-influence markers tying each config change back to the feedback entry that drove it (T-092's citations) | todo | T-092 |
