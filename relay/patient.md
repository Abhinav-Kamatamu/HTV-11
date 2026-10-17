# Relay: patient

<!-- Baton for the patient lane. Any teammate's Claude session can pick this up with /pickup patient.
     Keep sections short. Newest log entry on top. -->

## Status
T-060 done. T-061 through T-064 open next.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-061: camera upload for meal + device photo with result preview (`POST /api/ingest/meal`,
  `/api/ingest/device` already exist from core — wire the patient-side upload UI to them).
- T-062: symptom chat with red-flag "seek care now" response (`POST /api/ingest/symptom`).
- T-064: weekly sleep check-in, fixed form, no Gemini.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- No real auth: `/home` resolves "which patient am I" from a `?patient=<id>` query param,
  default `STORY_IDS.A` (Priya) — see `docs/DECISIONS.md` T-060. The dropdown in
  `src/app/(patient)/layout.tsx` (`patient-switcher.tsx`) switches it; reuse that convention
  for T-061-064 rather than adding a second mechanism.
- Timeline (`src/app/(patient)/home/timeline-data.ts` + `timeline.tsx`) only shows meals,
  symptom_logs, lab_reports, and observations with `source in ('device_photo','manual')` —
  seeded daily vitals are `source: 'synthetic'` and deliberately excluded so 90 days of
  background vitals don't flood the feed. T-061's device-photo ingest will show up here
  automatically once it writes `device_photo` observations; no timeline change needed.
- `timeline.ts` and `timeline.tsx` in the same folder collide on module resolution (TS can't
  tell which one `./timeline` means) — the builder file is named `timeline-data.ts`, not
  `timeline.ts`. Keep that naming if you add more builder/renderer pairs here.
- Patient page deliberately never reads `flags`/scores from `getPatientSummary` (CLAUDE.md §4:
  no risk alert reaches the patient directly, only a validated flag's message).
- Smoke-tested the validate-flag -> message -> patient-inbox path live against the shared Tiger
  Cloud DB on Patient B's `htn` flag, then reverted it (status back to `new`, test message
  deleted) so the demo DB is unchanged for everyone else.

## Log
<!-- scripts/handoff.sh appends entries here. -->
