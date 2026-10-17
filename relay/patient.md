# Relay: patient

<!-- Baton for the patient lane. Any teammate's Claude session can pick this up with /pickup patient.
     Keep sections short. Newest log entry on top. -->

## Status
T-060 through T-063 done. T-064 open next.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-064: weekly sleep check-in, fixed form, no Gemini. No API route exists for this
  (not listed in ARCHITECTURE.md) — write it as a server action in this lane's folder
  (same pattern `home/page.tsx` already uses: import `getDb`/`engine-db` directly)
  rather than adding a route under core's `src/app/api`.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- T-063: `UploadCard` (`upload-card.tsx`) now takes `kind: "meal" | "device" | "labs"`. The
  per-kind `COPY` map carries the multipart field name (`photo` for meal/device, `doc` for
  labs — matches `/api/ingest/labs`'s `readUploadedFile(formData, "doc")`), the `accept` string,
  and whether to set `capture="environment"` (false for labs, since a lab report is usually a
  PDF or a screenshot, not a live camera shot). The preview area now branches on
  `file.type.startsWith("image/")`: a PDF shows a filename chip (`FileText` icon) instead of
  trying to render it as an `<img>`. Labs reuses `DeviceResult`-shaped `{observations, extraction}`
  (same `metricLabel()` preview), not the full `labReport.extracted`. Smoke-tested end to end
  (synthetic lab image generated with PIL: HbA1c/fasting glucose/creatinine, run through the
  real route and Gemini) against the shared Tiger Cloud DB on Patient A, then deleted the
  exact `lab_reports`/`observations` rows it created and re-ran `runEngineForPatient` — same
  revert convention as T-061/T-062.
- T-062: `src/app/(patient)/symptoms/` (page + `symptom-chat.tsx`) posts JSON `{patientId, text}`
  to `/api/ingest/symptom` (unlike the multipart `/api/ingest/{meal,device}` routes T-061 used).
  The route's response already carries the final `redFlag` boolean and fixed `message` string
  (OR of Gemini's guess and the engine's `SYMPTOMS` red-flag list) — the client renders those
  verbatim and never re-derives red-flag status from the raw codes itself. `flags` from the
  response is dropped client-side, same convention as `upload-card.tsx`. Symptom code labels
  come from `SYMPTOMS[code].label` in `@/engine/symptoms` (read-only import, fine from this lane
  per ARCHITECTURE.md folder table). Linked from `/home`'s header via a new "How I'm feeling"
  button next to "Log a meal or reading".
- Smoke-tested `/api/ingest/symptom` live against the shared Tiger Cloud DB on Patient A (one
  normal message, one red-flag chest-pain message), then deleted the two test `symptom_logs`
  rows and re-ran `runEngineForPatient` for Patient A so the flags table matches the pre-test
  state — same revert convention as the T-060/T-061 Gotchas above. Do this via a one-off script
  under `scripts/` run with `npx tsx --env-file-if-exists=.env.local` (relative imports, not
  `@/...` — `tsx` doesn't resolve the `tsconfig` path alias) and delete the script afterward;
  don't leave `flags` stale after a manual symptom-log delete, since the engine doesn't
  recompute on its own.
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
