# Relay: patient

<!-- Baton for the patient lane. Any teammate's Claude session can pick this up with /pickup patient.
     Keep sections short. Newest log entry on top. -->

## Status
T-060, T-061 done. T-062 through T-064 open next.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
- T-062: symptom chat. Add `src/app/(patient)/symptoms/page.tsx` + client `symptom-chat.tsx`,
  following `upload/` page conventions (`?patient=` param, `STORY_IDS.A` default, plain
  bordered-div card, no new UI primitives). Posts `{patientId, text}` to the existing
  `POST /api/ingest/symptom` (core, already built). Show extracted codes as plain text;
  when `redFlag` is true, render a prominent destructive banner with the returned `message`.
  Drop `flags` from the client state entirely (never show risk to the patient, CLAUDE.md §4).
  Link to it from `/home` or `/upload`.

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-063: lab report upload (depends on T-061) — reuse `UploadCard` pattern in
  `src/app/(patient)/upload/upload-card.tsx`, posting to `/api/ingest/labs` (multipart
  pdf/img, already built by core). Probably needs a third card variant since labs accept
  PDF as well as photo (`accept="image/*,application/pdf"`, no `capture` attribute).
- T-064: weekly sleep check-in, fixed form, no Gemini. No API route exists for this
  (not listed in ARCHITECTURE.md) — write it as a server action in this lane's folder
  (same pattern `home/page.tsx` already uses: import `getDb`/`engine-db` directly)
  rather than adding a route under core's `src/app/api`.

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
- T-061: `/api/ingest/meal` and `/api/ingest/device` return the API's own envelope directly
  (no `{data: ...}` wrapper — see `_lib/http.ts` `ok()`), so the client just does
  `await res.json()` and checks `res.ok`. Smoke-tested both routes end to end (synthetic
  BP-monitor and plate images, generated with PIL) against the shared Tiger Cloud DB, then
  deleted the exact meal/observation rows and local `uploads/*.jpg` files afterward — same
  revert convention as the validate-flag test above. The Gemini meal extraction returned
  confidence 0.05 on a non-photo test image, which is a good real-world exercise of the
  `ResultPreview` "estimated from photo, review the details" badge path.
- `Button` is `@base-ui/react`, not shadcn/radix: use `render={<Link .../>}` to compose it
  with `next/link`, not an `asChild` prop (radix convention, doesn't exist here).
- Only `Badge` and `Button` exist under `src/components/ui` — no `Card`. Keep using the
  plain `rounded-xl border border-border bg-background p-4` div convention from
  `timeline.tsx`/`messages-panel.tsx` for card-like UI instead of inventing a new primitive.

## Log
<!-- scripts/handoff.sh appends entries here. -->
