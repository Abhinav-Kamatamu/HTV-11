# Relay: engine

<!-- Baton for the engine lane. Any teammate's Claude session can pick this up with /pickup engine.
     Keep sections short. Newest log entry on top. -->

## Status
T-020 done (thresholds verified, `src/engine/sources.ts` written). Next: T-021 and the other engine tasks.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-021 `scores.ts` (CANRISK is 3 bands only; FLI takes TG in mg/dL = mmol/L x 88.57), then T-029 and T-030, which are unblocked now.
- T-022 / T-027 / T-028 / T-023 only need T-001 and are pure math; any of them can go in parallel.
- T-031 is last in the engine chain and needs T-021 to T-023, T-027 to T-030.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- Import constants from `THRESHOLDS` in `src/engine/sources.ts`; cite by `SourceId` (`isSourceId` guards Gemini output).
- Open team call: home BP 135/85 (2020) vs 130/80 (2025 primary-care guideline). Engine uses 135/85; see DECISIONS.md 03:30.
- Patient A's HbA1c 5.5 to 5.9 is Diabetes Canada's "at risk" tier, not "normal"; keep demo wording to "under the 6.0% line".
- Rapid eGFR decline rule is KDIGO 2012 (secondary-verified); KDIGO 2024 does not contain it.
- Shell tip: do not `cd` into the scratchpad in Bash; it changes the working directory for later calls.

## Log
<!-- scripts/handoff.sh appends entries here. -->
