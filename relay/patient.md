# Relay: patient

<!-- Baton for the patient lane. Any teammate's Claude session can pick this up with /pickup patient.
     Keep sections short. Newest log entry on top. -->

## Status
Starting T-060.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
T-060 Patient home: timeline + messages.
- `src/app/(patient)/layout.tsx`: header reusing the existing `RoleSwitcher`, plus a small
  patient-switcher dropdown (no real auth; `?patient=` query param, default Patient A).
- `src/app/(patient)/home/page.tsx`: patient header, Messages inbox (`listMessages`), and a
  merged Timeline (meals/symptomLogs/labReports, newest first) with per-type cards.
- Reuses `getPatientSummary`/`listMessages` from `src/app/api/_lib/engine-db.ts`; no new API
  routes, no new deps. One DECISIONS.md line for the default-patient choice.

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- See TASKS.md for this lane's first todo.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
(none)

## Log
<!-- scripts/handoff.sh appends entries here. -->
