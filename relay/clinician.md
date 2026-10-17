# Relay: clinician

<!-- Baton for the clinician lane. Any teammate's Claude session can pick this up with /pickup clinician.
     Keep sections short. Newest log entry on top. -->

## Status
T-042 through T-047 done.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-048: `/benchmark` page — nav item already reserved and greyed "coming soon" (T-040), reads
  `POST /api/benchmark/run` (T-010).

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- **T-047: "stale-trend label on charts" only applies to vitals, not labs.** `evaluate()`/`points.ts`
  only mark the daily-series (heartbeat) contribution stale when a patient stops logging — labs aren't
  a heartbeat (`evaluate.test.ts` "does not mark lab trends stale"). So the chart annotation lives in
  `vitals-chart.tsx`/`vitals-charts.ts` only; `lab-chart.tsx` is untouched. `buildVitalsCharts` now
  takes an optional `silence: Silence | null` second arg (the patient's `Evaluation.silence`, same
  value the queue's batched `listSilenceSql` produces) and stamps every returned series with
  `staleDays`, which draws a dashed `ReferenceLine` at the series' last point.
- **Don't put the stale-logging label at `insideTopRight` — it collides with the CUSUM change-point
  label at `insideTopLeft`.** First draft did this and on Rosa Delgado's systolic-BP chart (which has
  both a CUSUM marker near the right edge and a stale marker at the last point) the two label strings
  rendered on top of each other, unreadable — this kind of thing only shows up in a screenshot, not
  lint/tsc/tests. Fixed by moving the stale label to `insideBottomRight` in `vitals-chart.tsx`; any new
  per-chart annotation should check it doesn't land in the same top-left/top-right corner pair the
  CUSUM markers already use.
- **`listQueue()` now also runs `listSilenceSql`** (T-008, `src/db/silence.ts`) as a 4th parallel query
  and stamps `silence: Silence | null` onto every `QueuePatient` — same pattern `/api/engine/run`
  already used for a batched silence scan across all patients. The `/queue` page adds a `?silent=1`
  toggle (own pill, next to the severity filter group, AND'd together via `queueHref()`) and a
  per-row `Badge` ("Stopped logging · Xd", `WifiOff` icon, neutral styling — not a severity color)
  when `p.silence` is set. Rosa Delgado (`...019`) is the only silent patient in the seed (11 days).
- **T-044's visit-summary route is a real Gemini call (3-6s) — the UI is on-demand, not
  auto-fetched.** `GET /api/patients/[id]/visit-summary` (new) calls the already-existing but
  previously-unused `getGeminiClient().visitSummary(...)` (src/ai/gemini.ts had the prompt/schema
  from T-026 but no route called it until now). The client card (`visit-summary.tsx`) only fires on
  a "Generate" button click, so page loads and screenshot tests don't burn a Gemini call every time.
  No chromium-cli/playwright/puppeteer installed in this repo — verified the click -> fetch -> render
  loop with a ~60-line raw CDP script (Node's built-in `fetch`/`WebSocket`, no new deps) against
  headless `google-chrome --remote-debugging-port`; didn't commit the script (scratchpad-only), so
  the next session needing a browser screenshot will have to write one again or install a package.
- **Exported `Citation` from `flag-card.tsx`** (was a private helper) so `visit-summary.tsx` can
  reuse the same source-link styling for Gemini's `citedSourceIds` instead of duplicating it.
- **Recharts `ReferenceLine` label at `position: "top"` gets clipped by the chart's own margin.** First
  draft of the vitals CUSUM marker (T-046) used `position: "top"` with the default `margin: { top: 8 }`
  carried over from `lab-chart.tsx` (which only needed room for the x-axis, not a floating label) — the
  label text rendered half off the top edge of the SVG. Fixed in `vitals-chart.tsx`: `margin.top: 20`
  plus `position: "insideTopLeft"` (same position lab-chart's threshold-band labels use) keeps it inside
  the plot area. Screenshot before trusting any new `ReferenceLine`/`ReferenceArea` label placement —
  this kind of clipping doesn't show up in `tsc`/lint/tests at all.
- **T-046 reuses `evaluate()` rather than re-deriving mets/STOP-Bang in the UI.** `getPatientSummary`
  only returns persisted `flags` rows (text + points, not the structured `MetsResult`/`StopBangResult`),
  so the mets chips and STOP-Bang line come from calling `loadPatientRecord(getDb(), id)` +
  `evaluate(record)` directly in `patients/[id]/page.tsx` (same functions `runEngineForPatient` uses
  server-side) and reading `evaluation.mets` / `evaluation.stopBang` — a second query path alongside
  `getPatientSummary`, not a UI reimplementation of the engine's cutoffs.
- **T-043's flag card already satisfies T-045** (one ledger row per contribution — layer, +points,
  reason, citations — plus the total labeled "priority points" next to the severity badge), so T-045
  is marked done too rather than rebuilt. `src/app/(clinician)/patients/[id]/flag-card.tsx`.
- **The dynamic-route Suspense gotcha from T-041 has a second half**: a `[id]` dynamic segment forces
  the *whole* route (including the shared layout above it) into fully dynamic rendering under
  `cacheComponents`, which then requires every client component reading the URL — `RoleSwitcher`'s
  `usePathname()` in `(clinician)/layout.tsx` — to sit inside its own `<Suspense>`, even though it
  rendered fine on `/queue` (no dynamic segment there). Fixed by wrapping `<RoleSwitcher />` itself in
  `(clinician)/layout.tsx`. Any new dynamic route under this lane will hit the same error
  ("`usePathname()` in a Client Component outside of `<Suspense>`") the first time it's screenshotted
  unless this stays wrapped.
- **Chart y-domain must never include a threshold band's raw value.** ACR's guideline bands (3, 30
  mg/mmol) are an order of magnitude above the seed's actual values (~1); first draft put bands in the
  axis min/max calc and it flattened the real line to a flat horizontal smear. Fixed in
  `lab-chart.tsx`: the y-domain comes only from observed + projected points, and a band outside that
  domain is just not drawn (no squeeze-to-fit). Also needed a `YAxis` `tickFormatter` — Recharts'
  auto-generated tick values on a non-round domain render as floating-point noise ("0000001") without
  one.
- **`getPatientSummary` (`_lib/engine-db.ts`) touched**: `rowToFlag` hardcodes `status: "new"` (it's
  the engine's own pre-persistence `Flag` type, always "new" before a DB round-trip); the summary's
  per-flag mapping now overrides it with the real `row.status` so the UI can tell a validated flag
  from a fresh one. One-line change to a core-owned file; flagged here per CLAUDE.md §2.
- **Dismiss click-tested live against the shared Tiger Cloud seed** (user granted permission after
  auto-mode first blocked it as a shared-resource write): clicked Dismiss on Rosa Delgado's
  (`...019`) `engagement` flag at `/patients/5eed0002-0000-4000-8000-000000000019`, confirmed the
  flag card disappeared and the page showed "No open flags.", then restored her with `POST
  /api/engine/run { "patientId": "5eed0002-...019" }` and confirmed via `/api/clinician/patients`
  that she's back to `monitor`/1 flag, same reason text. Validate's request body differs only by
  field name (`note` vs `reason`) and was already schema-checked against `/api/flags/[id]/validate`,
  not separately click-tested — low risk, same code path.
- Added `src/components/ui/` has no new components this round; flag-card/lab-chart reuse `Badge` and
  `Button` as-is. New non-`ui/` files: `patients/[id]/page.tsx`, `lab-charts.ts` (pure chart-data
  builder over `labtrend.ts`), `lab-chart.tsx` (Recharts, client), `flag-card.tsx` (client).
- Added `recharts` (`^3.2.1`, DECISIONS.md) — first chart lib in the repo. Dark mode wasn't verified
  for the new charts (colors are CSS custom properties with dark variants already in `globals.css`, so
  it should follow automatically, but nobody has looked at it with the eye).
- **T-041 built against the real `/api/clinician/patients` data, not mock data** — T-005 (the
  ranked-list API / `listQueue()` in `src/app/api/_lib/engine-db.ts`) was already done by the time
  this task started, so the task text ("mock data until T-005") was stale. The page imports
  `listQueue(getDb())` directly (server component, no self-HTTP round trip) rather than hitting the
  route handler — same shared `_lib` core already exposes, just called in-process.
- **Cache Components gotcha**: this Next 16 project has `cacheComponents` on (see `next.config.ts`,
  T-001/T-003 decisions). A server component that reads `searchParams` and then calls something
  with a `Date.now()` default parameter (here, `listQueue`'s `now = Date.now()`) fails at request
  time with "Next.js encountered the unstable value `Date.now()` while prerendering" **even though
  `searchParams` is itself a dynamic API** — awaiting it alone isn't enough to silence the static-shell
  analysis. Fix needed BOTH parts: wrap the data-dependent subtree in `<Suspense>` (split into a
  `QueuePage` shell + async `QueueContent` + `QueueSkeleton` fallback) AND call `await connection()`
  (from `next/server`) as the first line inside the Suspense-wrapped component. Either alone throws
  (`connection()` with no Suspense around it throws a *different* "accessed outside of `<Suspense>`"
  error; Suspense with no `connection()` still throws the original Date.now() error). Any future
  clinician/patient page that reads live DB state behind `searchParams` will hit this — copy the
  pattern from `src/app/(clinician)/queue/page.tsx`.
- Don't pass `Date.now()` explicitly as an argument in a page component's render body — ESLint's
  `react-hooks/purity` rule (`Cannot call impure function during render`) flags it even though it's
  fine inside an imported function's own default parameter (that file isn't scanned as a component).
  Let `listQueue`'s own default supply `now`.
- Added `src/components/ui/badge.tsx` (shadcn-style, `cva` + `cn`, variants default/secondary/outline/
  destructive) for the severity pill — reusable for T-043/T-045's flag severity/kind chips.
- Severity color mapping (urgent=red/destructive, review=amber, monitor=blue, none=neutral outline)
  is inline in the queue page via `className` overrides on `<Badge variant="outline">`, not baked
  into the Badge component itself — `globals.css` has no amber/blue design tokens, only the
  grayscale + destructive theme vars, so this uses raw Tailwind color utilities. If a later task
  wants these as reusable severity variants, consider promoting them into `badgeVariants` then.
- Queue rows are **not** links yet — `/patients/[id]` doesn't exist until T-042, so rows are static.
- Route groups `(clinician)`/`(patient)` don't add a URL segment, so pick non-colliding path
  segments between the two lanes. Clinician so far: `/queue` (landing), nav also reserves
  `/benchmark` (T-048, not built yet — nav item is greyed "coming soon"). Patient lane: planned
  `/home` is referenced by the role switcher but not built yet (T-060).
- Touched two files outside the clinician folder (unavoidable for a cross-role switcher):
  `src/app/page.tsx` (now a role-chooser landing page, was the scaffold hero) and
  `src/app/layout.tsx` (metadata title/description only, was "Create Next App" boilerplate).
- Added `src/components/role-switcher.tsx` (shared, not under `components/ui/`) — a `usePathname`
  pill toggle linking `/queue` <-> `/home`. Patient lane should reuse it in T-060's layout rather
  than building a second one.
- shadcn Button here uses base-ui/react's `render` prop, not `asChild` (Radix convention) —
  `<Button render={<Link href="/queue">Clinician</Link>} />`.
- No new deps needed for T-040 (button.tsx + lucide-react + cn already in place from T-001).

## Log
<!-- scripts/handoff.sh appends entries here. -->
- 2026-10-17: T-047 done — "stopped logging" badge/filter + stale-trend chart label. `listQueue()`
  (`src/app/api/_lib/engine-db.ts`) now batches `listSilenceSql` (T-008) alongside its other queries
  and stamps `silence: Silence | null` onto each `QueuePatient`. `/queue` gets a `?silent=1` toggle
  pill (AND'd with the existing severity filter) and a neutral "Stopped logging · Xd" badge per
  silent row. `buildVitalsCharts` takes the patient's `Evaluation.silence` and `VitalsChart` draws a
  dashed `ReferenceLine` + label at the last logged point — labs are untouched, since only the daily
  heartbeat series goes stale (see Gotchas). Verified with `npm run lint`, `tsc --noEmit`, `npm test`
  (279 passing, no new tests — matches this lane's untested chart/page convention), and headless-
  Chrome screenshots against the live 25-patient seed: `/queue?silent=1` shows only Rosa Delgado
  (`...019`, 11 days silent) with the toggle active and the row badge; `/queue` unfiltered shows no
  false positives on the other top rows; her patient detail page's three vitals charts (systolic BP,
  diastolic BP, weight) each show the stale marker at the last point, no console errors. Caught and
  fixed a label-collision bug along the way (stale label overlapping the CUSUM change-point label on
  her systolic chart — see Gotchas) that only showed up in the screenshot, not lint/tsc/tests.
- 2026-10-17: T-044 done — visit prep summary. New `GET /api/patients/[id]/visit-summary` route
  calls the existing `getGeminiClient().visitSummary` (src/ai/gemini.ts, T-026) with the patient's
  name and open flags from `getPatientSummary`, returning its `Extraction<VisitSummary>` untouched
  (bullets + citedSourceIds, or a manual-entry fallback). New "Visit prep summary" card
  (`visit-summary.tsx`) on the patient detail page, above "Open flags": an on-demand "Generate"/
  "Regenerate" button (no auto-fetch on page load, since each call is a real Gemini request),
  rendering the bullets as a list with citation links (reused `flag-card.tsx`'s now-exported
  `Citation`). Verified with `npm run lint`, `tsc --noEmit`, `npm test` (279 passing, no new tests —
  matches the untested client-component convention for this lane), and a live run against the
  Tiger Cloud seed: curled the route directly for Priya Nair (returns her T2D-symptom bullets citing
  Diabetes Canada 2018) and for a zero-flag patient (Ava Roy, returns a graceful "no open flags"
  bullet, not an error); screenshotted the live click end to end in headless Chrome (button click ->
  loading -> rendered bullets + citation, zero console errors) — see Gotchas for how, since no
  browser-automation package is installed in this repo.
- 2026-10-17: T-046 done — chart additions. Sen projection/crossing-band on lab charts was already
  done (T-042). Added: a `vitals-charts.ts`/`vitals-chart.tsx` pair (parallel to the lab- versions,
  but dense daily OLS series, no projection) for home systolic/diastolic BP and weight, each with a
  dashed vertical marker per CUSUM change-point (`changepoint.ts`'s `detectChangePoints`) labeled with
  the shift and date; a metabolic-syndrome 3-of-5 chip row (`mets-chips.tsx`) showing met/not-met/
  unknown per criterion plus treatment overrides; a STOP-Bang line (`stopbang-line.tsx`, a plain
  CSS 0-8 track shaded by band with a marker at the lower-bound score, not a Recharts chart). The
  patient page now also calls `loadPatientRecord` + `evaluate()` alongside `getPatientSummary` to get
  `mets`/`stopBang` (see Gotchas). Verified with `npm run lint`, `tsc --noEmit`, `npm test` (279
  passing, no new tests — matches the untested `lab-charts.ts` convention for pure chart-data
  builders), and headless-Chrome screenshots of Marcus and Daniel against the live 25-patient seed:
  Marcus's home BP charts show "+14 mmHg ~Sep 3" / "+9 mmHg ~Sep 4" matching the SPEC §6 demo line
  exactly, STOP-Bang shows "High · score 7 of 8" matching his flag card; Daniel shows "3 of 5 criteria
  met, 2 unknown · meets screening threshold" with HDL/fasting glucose correctly unknown rather than
  not-met, STOP-Bang "Low · score 2 of 8". Caught and fixed a CUSUM label clipping bug along the way
  (see Gotchas).
- 2026-10-17: T-042 + T-043 done (batched), T-045 done as a side effect of T-043. Patient detail
  route `/patients/[id]`: lab trend charts (Recharts, new dep) for the 4 trend-eligible metrics
  (hba1c, fpg, egfr, acr) with a Sen projection line + crossing-range band + guideline threshold
  lines, plus plain charts for the chart-only labs (alt, ast, ggt, platelets, hdl). Flag cards with
  the full points-ledger "why" panel (layer, +points, reason, citations, stale/unconfirmed markers),
  total labeled "priority points", and working Validate/Dismiss (note/reason field, calls the
  existing API routes, `router.refresh()`). Queue rows now link to the detail page. Hit and fixed a
  second half of the T-041 Cache Components gotcha (dynamic `[id]` route forces the shared layout's
  `RoleSwitcher` to need its own `<Suspense>`) and a chart bug (threshold bands outside the data range
  were stretching the y-axis and flattening the real line — now only drawn when in-domain). Verified
  with `npm run lint`, `tsc --noEmit`, `npm test` (279 passing), and headless-Chrome screenshots of
  all three story patients (Priya/Marcus/Daniel) against the live 25-patient seed — no console
  errors, numbers match the story (Priya's HbA1c crossing in ~24mo, Marcus's eGFR crossing in ~26mo).
  Also live-click-tested Dismiss against the shared DB on a non-story patient and restored it via
  `/api/engine/run` afterward (see Gotchas) — confirmed working end to end.
- 2026-10-17: T-041 done — `/queue` now reads the real `listQueue()`/`/api/clinician/patients`
  ranking (T-005 was already built, so this skipped the planned mock-data phase), with a
  `?severity=` filter (All/Urgent/Review/Monitor/None) and a new `Badge` component. Hit and fixed a
  Cache Components `Date.now()`-during-prerender issue (Suspense + `connection()`, see Gotchas).
  Verified with `npm run lint`, `tsc --noEmit`, `npm test` (279 passing), and headless-Chrome
  screenshots of all five filter states against the live 25-patient seed on Tiger Cloud (no console
  or server errors).
- 2026-10-17: T-040 done — clinician layout shell (header nav: Queue live, Benchmark stubbed),
  `/queue` placeholder page, shared `RoleSwitcher` component, root `/` turned into the role-chooser
  landing page. Verified with `npm run lint`, `tsc --noEmit`, and a headless-Chrome screenshot of
  `/` and `/queue` (nav highlighting correct, no console errors).
