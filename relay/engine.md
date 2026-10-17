# Relay: engine

<!-- Baton for the engine lane. Any teammate's Claude session can pick this up with /pickup engine.
     Keep sections short. Newest log entry on top. -->

## Status
Done: T-020 sources.ts, T-021 scores.ts, T-022 trends.ts, T-027 labtrend.ts, T-028 changepoint.ts, T-023 symptoms.ts, T-029 cooccurrence.ts, T-030 stopbang.ts (all in src/engine with tests, 131 tests green).
Left in order: T-031 points (severity floors), T-024 flags, then T-025/T-026 (src/ai, Gemini). No flags exist in the DB until T-031/T-024.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
T-031 `points.ts` + `evaluate` orchestrator (started 2026-10-17):
- Contribution/Severity types, point table + per-layer cap 4 + bands as constants; PatientRecord in (obs by metric, symptom logs, intake, optional silence), per-condition ledgers out.
- Builders per condition (t2d, ckd, htn, masld, mets, osa, engagement) reusing labtrend/trends/changepoint/scores/symptoms/cooccurrence/stopbang; severity = bands then floors; red-flag = patient-level urgent.
- Tests on generateSeed(): A review (~7), B review, C monitor, Walter Hughes urgent, Rosa Delgado engagement monitor + stale.

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-031 `points.ts` + an `evaluate` orchestrator: a PatientRecord in (observations by metric, symptom logs, intake, silence info), Flags out. Build it so tests can feed `generateSeed()` output, no DB needed. Feed `evaluateStopBang`'s `band`/`lowerBound` into the `sleep` layer per RISK_ENGINE §6 (intermediate/high -> +1/+2, high also fires an `osa` monitor flag regardless of points). Then T-024 `flags.ts` (Flag objects, kind = biggest contributor, ranking).
- Then T-025/T-026 in `src/ai` (needs a Gemini key in `.env.local`; add the dependency with a DECISIONS line).

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- Import constants from `THRESHOLDS` in `src/engine/sources.ts`; cite by `SourceId` (`isSourceId` guards Gemini output).
- Team decisions (DECISIONS 04:40, 05:10, 06:00): home BP is 130/80 (2025), CANRISK has a very high band (>= 43), Patient A's HbA1c is 4.65 to 5.4 twice-yearly, trend layer targets 6.0 (~2.0 yr out), never project 6.5. Sleep check-in is weekly. Patient C stays on amlodipine.
- T-031 severity rules (RISK_ENGINE §6): bands 0-2 none, 3-5 monitor, 6-9 review, >=10 urgent; floors: a SUSTAINED diagnostic range (HbA1c>=6.5 / FPG>=7.0; eGFR<60 or ACR>=3 on the latest two results >=90 days apart; home BP avg >=130/80 over >=7 days) sets >= review; 2+ conditions in diagnostic range = urgent; red-flag symptom = patient urgent (bypass); screens (mets, STOP-Bang, CANRISK, FIB-4, FLI) never set a floor; gap-only flag = monitor. Walter Hughes must come out urgent; Patient B must stay review (his ACR 3.2 is a single result, so only htn is diagnostic); C must stay monitor.
- Trend flags fire only for metrics with a threshold: HbA1c(6.0), FPG(6.1), eGFR(60), ACR(3), home BP(130/80). Everything else (ALT, GGT, HDL, creatinine, weight...) is chart-only. Supporting layers (changepoint, sleep 3-4) only count when the condition already has a primary contribution.
- Module APIs already built: `labTrend/labCrossing/isRapidEgfrDecline` (labtrend.ts), `vitalsTrend/olsFit/baselineZScore` (trends.ts), `detectChangePoints` (changepoint.ts, minShiftSd 1.5 gate), `clusterScores/activeRedFlags/reportCount` (symptoms.ts), `fib4/fli/canriskBand/homeBpAverage/pairBp/egfrCategory/acrCategory` (scores.ts), `evaluateMets` (cooccurrence.ts), `evaluateStopBang/stopBangBand` (stopbang.ts), shared `Pt`, `DAY_MS` in types.ts.
- `stopbang.ts` (T-030): `evaluateStopBang(input): StopBangResult`, 8 items keyed `snoring|tired|observedApnea|pressure|bmi|age|neck|male`, each `{value: 0|1, known: boolean}`. Only the 3 check-in items, BMI and neck can be `known: false` (missing data); `pressure`/`age`/`male` are always known since they come from a rule, not a possibly-missing reading. `score` sums with unknowns at 0 (a lower bound), `band` is computed on that same lower-bound score — a missing item can only pull the band down, never up, matching Walter Hughes-style "still fires high even if neck isn't recorded" cases. `neckCm` is an observation (`Pt[]`), not a static intake field, same as `hdl`; weight and neck have no freshness window (only the sleep check-in does, 90 days).
- Seed contract: `intake.height_cm`, `intake.medications` (string[]), obs `hdl`, `neck_cm`, `sleep_snoring|tired|observed_apnea` (0/1, weekly, source synthetic). Patient C has no `hdl`/`fpg` rows on purpose (unknown criteria). Treatment = non-empty `medications`.
- `cooccurrence.ts` (T-029) is done: `evaluateMets(input): MetsResult`, criteria keyed `waist|triglycerides|hdl|bp|fpg`, each `{status: "met"|"not_met"|"unknown", ...byTreatment}`. Treatment only flips an *existing* not-met reading to met (TG/HDL/BP) — it never turns `unknown` into `met`, and never applies to FPG at all (otherwise Patient C's never-drawn HDL would wrongly read "met"). RISK_ENGINE §4a and DECISIONS.md updated to match; pass `homeBpAverage()`'s output straight in as `homeBp`, don't recompute BP averaging here.
- Preview of layers on the seed (throwaway script, not the engine): A t2d 4 monitor (+ symptoms up to 3), B ckd 8 review / htn 6 review / osa monitor, C mets 3 monitor, urgent case only monitor by points so it relies on the red-flag bypass.
- Controls stay under 130/80. A few controls show spurious n=4 lab trends (HDL, GGT, creatinine); harmless because only thresholded metrics can fire a trend.
- Seed silent patient: num 25 Rosa Delgado (`SILENT_ID`), last log 11 days ago, active every day before. Patient B's BP step is 42 days ago; CUSUM finds it ~44 days ago (+14.5/+9.2).
- Debug trick: vitest swallows console.log here; write results to a file in the scratchpad instead. Never run vitest with `--root /`.
- Rapid eGFR decline rule is KDIGO 2012 (secondary-verified); KDIGO 2024 does not contain it.
- Shell tip: do not `cd` into the scratchpad in Bash; it changes the working directory for later calls.

## Log
<!-- scripts/handoff.sh appends entries here. -->
- 2026-10-17 · T-030 done: `stopbang.ts` (STOP-Bang screen, lower-bound scoring for missing items), 17 tests, 131 total green.
- 2026-10-17 · T-029 done: `cooccurrence.ts` (metabolic syndrome 3-of-5), 18 tests, 114 total green. Fixed a RISK_ENGINE/seed inconsistency on the treatment override (see DECISIONS.md).
