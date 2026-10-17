# Relay: engine

<!-- Baton for the engine lane. Any teammate's Claude session can pick this up with /pickup engine.
     Keep sections short. Newest log entry on top. -->

## Status
Done: T-020 sources.ts, T-021 scores.ts, T-022 trends.ts, T-027 labtrend.ts, T-028 changepoint.ts, T-023 symptoms.ts, T-029 cooccurrence.ts, T-030 stopbang.ts, T-031 points.ts + evaluate.ts (+ silence.ts, record.ts) (all in src/engine with tests, 215 tests green repo-wide).
Left in order: T-024 flags (Flag objects from the ledgers, ranking), then T-025/T-026 (src/ai, Gemini; needs a key in `.env.local`). No flags exist in the DB until T-024.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
T-024 `flags.ts`: `toFlags(evaluation)` per ledger with non-null severity — pick top contribution by
points then the tie-break order threshold>trend>score>cooccurrence>symptom_cluster>sleep>changepoint>gap
for `kind`/`title`/`rule`, union evidence/sourceIds, carry `label`. Add optional `normalizedSlope`
(|slope/yr| / threshold) to `Contribution` in points.ts, set it in evaluate.ts's `labTrends`/`htnTrend`,
for the ranking tiebreak. `rankPatients`: severity desc, points desc, normalizedSlope desc, gap-only
(engagement-only) patients always sort after any clinical one. Tests off `generateSeed()`.

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-024 `flags.ts`: `toFlags(evaluation): Flag[]` for every ledger with a `severity` (RISK_ENGINE §7): `kind` = layer of the biggest contributor (ties: threshold > trend > score > cooccurrence > symptom_cluster > sleep > changepoint > gap), `title` and `rule` from the top row, `evidence`/`sourceIds` unioned from the contributions, `status: "new"`. Red flags are NOT a Flag (patient-level alert; surface `evaluation.redFlags`). Then `rankPatients`: max severity, then total points across flags, then steepest normalized slope; a gap-only patient never outranks a clinical one. Use `evaluate()` on `buildRecord()` output; tests can feed `generateSeed()` (see `evaluate.test.ts`).
- Then T-025/T-026 in `src/ai` (needs a Gemini key in `.env.local`; add the dependency with a DECISIONS line).

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- `evaluate(rec: PatientRecord): Evaluation` (T-031). `Evaluation.conditions` is one `ConditionLedger` per condition with any contribution: `{condition, contributions, points, severity | null, basis, diagnostic, label}`; `severity: null` means NO flag (filter these out), a +0.5 symptom row on ckd for Patient A is normal. `basis`: points | diagnostic_floor | rapid_decline_floor | unconfirmed_floor | multiple_diagnostic | osa_screen | gap_only. Build input with `buildRecord({patient, observations, symptomLogs}, now)`; `rec.silence` undefined = derive via `detectSilence`, null = known not silent (use for the T-008 result). CANRISK is only used if `intake.canrisk_score` exists (the seed has none).
- Seed outcomes (anchor 2026-10-17): A t2d 7 review (trend 2+1, symptom 3, sleep 1); B htn 7 review (diagnostic), ckd 4 review (ACR 3.2 unconfirmed +2, eGFR trend +2, rapid-decline row +0, basis `rapid_decline_floor`), masld 4 monitor (FLI 61 + sleep), osa 2 monitor; C mets 3 monitor only (FLI 89 gives masld 2, no flag); Walter urgent (t2d/ckd/htn multiple_diagnostic + red flag); Rosa engagement monitor only (stale label is a stretch goal, her seed stays as is; stale marking is tested with a hand-built record); all 20 controls no flag at all. Patient severities: A review, B review, C monitor, Walter urgent, Rosa monitor, controls none.
- Floors (DECISIONS 2026-10-17, team): single unconfirmed abnormal value (eGFR<60, ACR>=3, HbA1c 5.5-6.4, FPG 5.6-6.9) floors at monitor with `label` "unconfirmed, repeat test suggested" (`Contribution.unconfirmed`, basis `unconfirmed_floor`); KDIGO rapid eGFR decline floors CKD at review via a 0-point trend row (basis `rapid_decline_floor`, not a diagnostic range). T-024 should surface `ConditionLedger.label` next to the flag. T-008 (core) must match `detectSilence` with a parity test.
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
- 2026-10-17 · T-031 follow-up: team decisions applied (unconfirmed-value floor at monitor with label, rapid eGFR decline floors CKD at review instead of +1, T-008 parity with `detectSilence`); B's CKD flag now review, controls still quiet; 215 tests green.
- 2026-10-17 · T-031 done: `points.ts` (ledger types, point table, layer cap, bands), `evaluate.ts` (orchestrator, severity floors, STOP-Bang osa flag, gap/stale), `silence.ts`, `record.ts`; 76 new tests incl. all seed story patients, 207 total green.
- 2026-10-17 · T-030 done: `stopbang.ts` (STOP-Bang screen, lower-bound scoring for missing items), 17 tests, 131 total green.
- 2026-10-17 · T-029 done: `cooccurrence.ts` (metabolic syndrome 3-of-5), 18 tests, 114 total green. Fixed a RISK_ENGINE/seed inconsistency on the treatment override (see DECISIONS.md).
