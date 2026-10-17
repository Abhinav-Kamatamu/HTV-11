# Relay: lab

<!-- Baton for the lab lane. Any teammate's Claude session can pick this up with /pickup lab.
     Keep sections short. Newest log entry on top. -->

## Status
New stretch lane, 2026-10-17, for the Papiers.ai autoresearch challenge (docs/PRIZES.md "Maybe").
Tasks T-090 to T-093 added to TASKS.md, all `todo`, all gated: do not start before the main demo
flow (SPEC §6) works end-to-end. No code written yet.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- Before claiming T-090: confirm the main demo flow is actually rehearsed/working (check T-083 and
  relay/pitch.md) — this whole lane waits on that, per the team's "demo first" rule (CLAUDE.md §4).
- T-090: hidden ground-truth labels + cutoff-date cohort view on top of the `--scale` seed (T-009,
  core-owned generator). Decide label definition precisely (which metric/threshold, "within N
  months" — pick N) and record it in docs/DECISIONS.md before building.
- T-091: evaluation harness scoring a config against T-090's labels (sensitivity, false-alarm rate,
  median lead time, flags/100). This is the piece T-092's agent loop calls on every iteration.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- `src/app/(clinician)/lab` sits inside the clinician lane's folder (`src/app/(clinician)/...`,
  ARCHITECTURE.md "Folder ownership"). Per CLAUDE.md §2, keep any touch there minimal and note it in
  `relay/clinician.md` Gotchas — a flagged heads-up was added there on 2026-10-17 when this lane was
  created.
- This whole lane is a hackathon-prize stretch (Papiers.ai, not in Primary/MLH), explicitly gated
  behind the demo being ready — see docs/PRIZES.md "Maybe" and docs/DECISIONS.md 2026-10-17. Don't
  let it compete for time with any lane still on the critical path.
- The hidden-label harness (T-090/T-091) must never leak the label or post-cutoff data into anything
  the engine or Gemini agent (T-092) can see — that would make the "evaluation" meaningless. Keep the
  label store and the cutoff filtering in `src/lab` only, separate from `src/engine`'s normal input
  path.

## Log
<!-- scripts/handoff.sh appends entries here. -->
- 2026-10-17: Lane created. Added `lab` row to TASKS.md's lane table, tasks T-090 to T-093 (all
  stretch, gated), this relay file, `lab` entry in `scripts/pickup.sh`'s `lane_paths()`, a folder-
  ownership line in docs/ARCHITECTURE.md, a decision line in docs/DECISIONS.md, and updated the
  Papiers row in docs/PRIZES.md / the stretch bullet in docs/SPEC.md §7 to match this concrete plan.
  No code written.
