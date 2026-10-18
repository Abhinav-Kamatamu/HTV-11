# Relay: lab

<!-- Baton for the lab lane. Any teammate's Claude session can pick this up with /pickup lab.
     Keep sections short. Newest log entry on top. -->

## Status
**DROPPED, 2026-10-17 (team decision, human request).** T-090 to T-093 marked `dropped` in
TASKS.md. Not enough time left before judging to safely start a gated stretch lane on top of
unfinished demo-rehearsal work (T-082/T-083) — see docs/DECISIONS.md. No code was ever written for
this lane, so nothing to revert; `src/app/(clinician)/lab` was never created.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
None. Do not pick up this lane — it's dropped, not just gated. If time frees up unexpectedly after
the demo is fully rehearsed and recorded, re-open by reverting the `dropped` status in TASKS.md and
re-reading this file's original plan below first.

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
