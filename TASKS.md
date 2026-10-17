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

## Board

| ID | Lane | Task | Status | Depends on |
|---|---|---|---|---|
| T-001 | core | Scaffold Next.js + TS + Tailwind + shadcn + Vitest + ESLint, `npm run dev/lint/test` work | done | |
| T-002 | core | Tiger Cloud only, no local Docker: Tiger Cloud service created, `timescaledb_toolkit` 1.26.0 confirmed there (`stats_agg`, `heartbeat_agg`, `dead_ranges`, `x_intercept` present), `DATABASE_URL` shared in team chat (not git) and set in each teammate's `.env.local` | done | |
| T-003 | core | Drizzle schema per ARCHITECTURE.md plus `flags.points int` and `flags.contributions jsonb` (RISK_ENGINE §7), migration, hypertable + continuous aggregates, `npm run db:migrate` | done | T-001 T-002 |
| T-004 | core | Deterministic seed generator with story patients A/B/C + controls, `npm run db:seed` | done | T-003 |
| T-005 | core | Ingest + clinician + flags API routes (stubs first, then real) | todo | T-003 |
| T-006 | core | Deploy to Vultr, register domain, HTTPS | todo | T-001 |
| T-007 | core | Tiger Data vitals math (RISK_ENGINE §8): `stats_agg(value, epoch_days)` in `obs_daily`/`obs_weekly`, SQL for slope, R² and threshold crossing (`x_intercept` or `(threshold - intercept)/slope`, record which in DECISIONS). Verify toolkit function signatures. Test: SQL output equals a pure-TS OLS on the seed vitals | todo | T-003 T-004 |
| T-008 | core | Silent patients: `heartbeat_agg` per patient per day, query for patients active in the prior 30 days with no heartbeat for 7+ days (`dead_ranges`), exposed to the engine and the queue API | todo | T-007 |
| T-009 | core | Scale mode: `npm run db:seed -- --scale 1000`, same seeded RNG, A/B/C keep fixed ids, archetype mix per RISK_ENGINE §9, `COPY` inserts, all rows `synthetic`. Default seed stays ~25 patients | todo | T-004 |
| T-010 | core | `POST /api/benchmark/run`: median of 5 warm runs for the three paths (continuous aggregate, raw table, fetch + compute in TS) on slope/R²/crossing for all patients, the silent-patient scan, and a full engine re-run. Returns patient count, row count and ms; nothing hard-coded | todo | T-007 T-008 T-009 T-024 |
| T-011 | core | Extend the seed for the new layers: triglycerides, HDL, waist, neck circumference, weekly sleep check-ins, a step change in Patient B's home BP (for CUSUM), Patient C with 3 metabolic criteria met and 2 unknown, one silent patient, Patient A keeps six twice-yearly HbA1c points, 4.65 to 5.4. DONE on 2026-10-17 (engine lane, see DECISIONS 05:10): HDL, neck_cm, weekly sleep check-ins, C 3 of 5 with 2 unknown, B STOP-Bang 7. Also done (06:00): B's home BP step change 42 days ago and silent patient 25 (Rosa Delgado) | done | T-004 |
| T-020 | engine | Verify every threshold in RISK_ENGINE.md §2 against the source (including metabolic syndrome cutoffs with Canadian waist values, STOP-Bang bands, Mann-Kendall/Sen/CUSUM references), write `sources.ts` with URLs | done | |
| T-021 | engine | `scores.ts`: CANRISK, FIB-4, FLI, home BP average, eGFR/ACR staging + tests | done | T-020 |
| T-022 | engine | `trends.ts`: OLS slope for vitals (mirrors the SQL in T-007), baseline z-score, projected crossing helper + tests. Lab trends are T-027 | done | T-001 |
| T-023 | engine | `symptoms.ts`: code list, weights, decayed cluster score, red-flag list + tests | done | T-001 |
| T-024 | engine | `flags.ts`: turn the points ledger into Flag objects (severity bands, `kind` = biggest contributor), ranking function + tests | todo | T-021 T-022 T-023 T-031 |
| T-025 | engine | `ai/gemini.ts` + zod schemas: extractMeal, extractDevice, extractLabs (incl. triglycerides, HDL), codeSymptoms | todo | T-001 |
| T-026 | engine | `explainFlag` (takes the ledger, may not change points, cites only sources on the rows) + `visitSummary` restricted to sources.ts | todo | T-024 T-025 |
| T-027 | engine | `labtrend.ts`: Mann-Kendall (exact p for n ≤ 10, tie-corrected normal above), Sen's slope and intercept, 90% slope interval, crossing date with range, gate (n ≥ 4, p < 0.10). Known-answer tests: monotone series give p = 2/n! (n=3: 0.333, n=4: 0.083, n=5: 0.017) | done | T-001 |
| T-028 | engine | `changepoint.ts`: tabular CUSUM on daily vitals (28-day reference, k = 0.5, h = 5, skip missing days, re-baseline after alarm), returns change date and shift size + tests incl. a no-change series that must not alarm | done | T-001 |
| T-029 | engine | `cooccurrence.ts`: metabolic syndrome 3-of-5 with met/not met/unknown per criterion, treatment counts as met, sex-specific cutoffs + tests | done | T-020 |
| T-030 | engine | `stopbang.ts`: score from sleep check-in answers + record (age, sex, BMI, neck, treated BP), lower-bound handling for missing items, 90-day freshness + tests | done | T-020 |
| T-031 | engine | `points.ts`: Contribution type, point values, per-layer cap of 4, severity bands, reason templates (engine-written, not Gemini), `gap` layer fed by T-008 and stale-trend marking + tests that the three story patients land in the SPEC §6 severities | doing | T-021 T-022 T-023 T-027 T-028 T-029 T-030 |
| T-040 | clinician | Role switcher + layout shell | todo | T-001 |
| T-041 | clinician | Patient queue sorted by risk, severity filter (mock data until T-005) | todo | T-040 |
| T-042 | clinician | Patient detail: lab trend charts with projection line + threshold bands | todo | T-040 |
| T-043 | clinician | Flag card with "why" panel, evidence list, citations, validate/dismiss | todo | T-042 |
| T-044 | clinician | Visit prep summary view | todo | T-026 |
| T-045 | clinician | Why panel renders the points ledger: one row per contribution with layer, +points, reason, citation, and the total next to the severity. Label "priority points" | todo | T-043 T-031 |
| T-046 | clinician | Chart additions: Sen projection with crossing-range band on lab charts, CUSUM change-point marker on vitals, metabolic syndrome 3-of-5 chips with unknowns, STOP-Bang line | todo | T-042 T-027 T-028 T-029 T-030 |
| T-047 | clinician | "Stopped logging" badge and filter in the patient queue, stale-trend label on charts | todo | T-041 T-008 |
| T-048 | clinician | `/benchmark` page (labeled "Synthetic scale test"): run button, patient and row counts, median ms per path as a bar chart, run timestamp | todo | T-040 T-010 |
| T-060 | patient | Patient home: timeline + messages | todo | T-040 |
| T-061 | patient | Camera upload for meal + device photo with result preview | todo | T-060 |
| T-062 | patient | Symptom chat (with red-flag "seek care now" response) | todo | T-060 |
| T-063 | patient | Lab report upload | todo | T-061 |
| T-064 | patient | Weekly sleep check-in: three yes/no taps (snoring, tired, observed apnea) plus optional hours slept, neck circumference asked once; writes observations per RISK_ENGINE §1. Fixed form, no Gemini | todo | T-060 |
| T-080 | pitch | Devpost draft, architecture diagram, 3-min demo script rehearsal | todo | |
| T-081 | pitch | DEV.to write-up (MLH DEV prize) | todo | |
| T-082 | pitch | Demo props: printed BP monitor photo, sample lab PDF, backup screen recording | todo | |
| T-083 | pitch | Rehearse the 6-beat demo in SPEC §6 (ledger why panel, CUSUM marker, metabolic 3-of-5, `/benchmark`), put the measured benchmark numbers and the Tiger Data story (`stats_agg`, `heartbeat_agg`, continuous aggregates) in the Devpost draft | todo | T-048 |
