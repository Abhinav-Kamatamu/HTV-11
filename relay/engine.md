# Relay: engine

<!-- Baton for the engine lane. Any teammate's Claude session can pick this up with /pickup engine.
     Keep sections short. Newest log entry on top. -->

## Status
T-020 to T-022 done. Working through T-027, T-028, T-023, T-029, T-030, T-031, T-024, then T-025/T-026.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
T-027 (engine): labtrend.ts: Mann-Kendall (exact p via inversion counts for n <= 10 without ties, tie-corrected normal otherwise), Sen slope + intercept, 90% slope interval, crossing date with range, gate (n >= 4, p < 0.10, 3 yr horizon). Known answers p = 2/n!.

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-021 `scores.ts` (CANRISK is 3 bands only; FLI takes TG in mg/dL = mmol/L x 88.57), then T-029 and T-030, which are unblocked now.
- T-022 / T-027 / T-028 / T-023 only need T-001 and are pure math; any of them can go in parallel.
- T-031 is last in the engine chain and needs T-021 to T-023, T-027 to T-030.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- Import constants from `THRESHOLDS` in `src/engine/sources.ts`; cite by `SourceId` (`isSourceId` guards Gemini output).
- Team decisions (DECISIONS 04:40 and 05:10): home BP is 130/80 (2025), CANRISK has a very high band (>= 43), Patient A's HbA1c is 4.65 to 5.4 twice-yearly, trend layer targets 6.0 (~2.0 yr out), never project 6.5.
- Seed contract: `intake.height_cm`, `intake.medications` (string[]), obs `hdl`, `neck_cm`, `sleep_snoring|tired|observed_apnea` (0/1, weekly, source synthetic). Patient C has no `hdl`/`fpg` rows on purpose (unknown criteria). Treatment = non-empty `medications`.
- Preview of layers on the seed (throwaway script, not the engine): A t2d 4 monitor (+ symptoms up to 3), B ckd 8 review / htn 6 review / osa monitor, C mets 3 monitor, urgent case only monitor by points so it relies on the red-flag bypass.
- Controls now stay under 130/80. 4 controls show a spurious n=4 HDL trend and one a GGT trend (p=0.083 to 0.096); the engine must not act on metrics without a threshold.
- Rapid eGFR decline rule is KDIGO 2012 (secondary-verified); KDIGO 2024 does not contain it.
- Shell tip: do not `cd` into the scratchpad in Bash; it changes the working directory for later calls.

## Log
<!-- scripts/handoff.sh appends entries here. -->
