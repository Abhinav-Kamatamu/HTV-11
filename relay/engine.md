# Relay: engine

<!-- Baton for the engine lane. Any teammate's Claude session can pick this up with /pickup engine.
     Keep sections short. Newest log entry on top. -->

## Status
T-020 in progress.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
T-020 (engine): verify every RISK_ENGINE.md §2 threshold against its primary source (web), write
`src/engine/sources.ts` (typed SOURCES record: id, title, publisher, year, url, verified thresholds),
fix wrong numbers in RISK_ENGINE.md with a DECISIONS.md line each, add a sources.test.ts (unique ids, https urls).
Unverifiable values get flagged in the file, not guessed.

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- See TASKS.md for this lane's first todo.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
(none)

## Log
<!-- scripts/handoff.sh appends entries here. -->
