# Relay: clinician

<!-- Baton for the clinician lane. Any teammate's Claude session can pick this up with /pickup clinician.
     Keep sections short. Newest log entry on top. -->

## Status
In progress.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
T-040 Role switcher + layout shell:
- Add `src/app/(clinician)/layout.tsx` with the dashboard shell (nav for Queue, Patient detail,
  Visit prep, Benchmark — stub links, pages land in later tasks).
- Add a small role-switcher control (clinician/patient) so both route groups are reachable from
  one entry point during the demo; land it near the root layout, not inside either route group.
- Add `src/app/(clinician)/page.tsx` placeholder so the shell renders before T-041 (queue) exists.
- Pull in any extra shadcn primitives only if needed; log new deps in docs/DECISIONS.md.

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- See TASKS.md for this lane's first todo.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
(none)

## Log
<!-- scripts/handoff.sh appends entries here. -->
