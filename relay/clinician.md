# Relay: clinician

<!-- Baton for the clinician lane. Any teammate's Claude session can pick this up with /pickup clinician.
     Keep sections short. Newest log entry on top. -->

## Status
T-042 through T-048 done. No open board tasks; this session did human-requested UI/tooling work
(no T-ID, same pattern as the earlier "pitch session" UI pass logged below).

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- No open clinician tasks. Next teammate picking up this lane should check TASKS.md for new work
  (or help another lane — patient and pitch are both unstarted) rather than run `/pickup clinician`
  expecting something queued.
- Human asked whether to also rework the "Why do this in the database?" speed-check chart at the
  bottom of `/benchmark` (live run now shows continuousAggregate 41ms / rawTable 39ms /
  fetchAndCompute 105ms on the 25-patient seed — a real ~2.7x story, not the flat numbers an
  earlier Gotcha entry warned about, since T-012's batching fix landed since then). Left as-is
  pending their answer.
- If extending the population-percentile idea (see Gotchas) to other metrics (eGFR for CKD, ALT/GGT
  for MASLD), copy `loadBpSlopePercentile`'s shape in `patients/[id]/page.tsx` but gate-check it
  against a second seed metric first — this seed's R² >= 0.5 gate only clears for 1-2 patients per
  metric, so double check the comparison population isn't degenerate before trusting the number.
- Run `npm run demo:rehearse` (new, see Gotchas) before the real pitch and after any change that
  touches a demo-beat route, not just once today — it's cheap and catches exactly the kind of stall
  that doesn't show up in lint/tsc/tests.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- **FIXED, demo-blocking (commit `4fd68ae`, human-found via "I can't see anything in clinician to
  send a message"): Validate never actually sent a patient message.** `flag-card.tsx` had one
  textarea labeled "Clinical note (optional)," POSTed only as the validate route's `note` field.
  The route's separate `message` field — the one `createMessageForFlag` actually needs to create a
  patient-facing message — was never sent from the UI at all. Validating set `status: "validated"`
  and saved an internal note, but **no message was ever created**, silently, no error shown. This is
  demo beat 3 ("I validate, and only now does the patient get a message"). Fixed by adding a second
  textarea, pre-filled with a condition-specific default (`defaultMessage()`, SPEC §3's "optionally
  edits a message" implies a draft exists, not a blank box) so Validate is one click for the demo's
  actual dialogue. Smoke-tested live end to end on Daniel Okafor's `mets` flag, reverted after (same
  convention as every other lane's smoke tests — see other Gotchas entries for the pattern).
- **If re-rehearsing beat 3 (T-083 still needs a full human click-through, see `relay/pitch.md`),
  budget an extra second to glance at the pre-filled message text before clicking Validate** — it's
  now a real, editable draft, not empty, so the demo line can just be "I validate" without typing
  anything live, or the speaker can edit it in place if they want the "live editing" beat to read as
  more hands-on.
- **`npm run demo:rehearse` (new, `scripts/demo-rehearsal.ts`, commit `8236d64`) times SPEC.md §6's
  6 demo beats against a running app** — narration budget (from the spec) tracked separately from
  actual technical latency, so a stall doesn't silently eat into the 3-minute slot. Read-only except
  beat 6's `POST /api/benchmark/run` (safe to repeat — only touches `status="new"` flags). Beats 3/4's
  mutating steps (validate/dismiss, send message, real Gemini photo calls) are intentionally NOT
  automated — `--live` just marks them "rehearse live," it doesn't fire them.
- **First run found beat 6 taking ~11.6s, not the ~2s the page's own numbers implied — fixed
  (`src/app/api/_lib/benchmark.ts`, `src/app/api/benchmark/run/route.ts`, both core-owned, touched
  minimally per CLAUDE.md §2).** `medianMs()` ran every path 5x and reported the median, which hid
  that the *request* blocks on all 5 samples finishing. Fine for the fast OLS paths (~40ms each), but
  the full engine re-run costs ~2s *per sample* and is deterministic given the same data (same
  `evaluate()` over the same observations), so 5 samples bought no extra signal, just ~10s of dead
  wall time. `medianMs` now takes an optional `times` param; the engine-rerun call passes `1`. Beat 6
  is ~3.5s now, confirmed stable across 3 runs. This is the kind of bug lint/tsc/`npm test` structurally
  cannot catch (it needs a live timed request against the real route) — exactly why the rehearsal
  script exists, not a one-off find-and-forget.
- **BP trend percentile on `/patients/[id]` (commit `c676c2a`): gate the subject patient, never gate
  the comparison population.** `loadBpSlopePercentile` batches `olsFitBatchSql` for `bp_systolic`
  across every patient (one query, T-012's pattern) and ranks the subject's slope against everyone
  else's with `engine/trends.ts`'s new `percentileRank`. First draft also applied `VITALS_GATE`
  (n>=14, R²>=0.5) to the comparison population, not just the subject — in this seed almost nobody's
  daily home BP clears R² >= 0.5 (most patients' BP is just noisy with no real trend), so the
  population collapsed to size 1 and Walter Hughes (the one patient with a real rising trend) came
  out at the 0th percentile instead of the 96th. Only the headline claim ("is this patient's own
  trend confident enough to state a number") needs the gate; a flat or noisy slope is still a real
  slope and belongs in the population being ranked against. This passed lint/tsc/tests fine — only
  caught by actually running the query live and checking the number against what the Population scan
  page already showed as the steepest riser.
- **Re-added the sunset-glow `body::before` background and the translucent/blurred header
  (`border-border/60 bg-card/75 backdrop-blur-xl`) that a same-day earlier session added then
  reverted** (`862374e` blurred glow -> `d343ee3` removed it back to flat cream pages). Human
  explicitly asked for the gradient on every screen, not just the home page — see commit `df4699b`.
  If asked to tone it down again, adjust rather than delete outright; this is the second time it's
  flipped today.
- **Replaced `src/app/favicon.ico` (the default Next.js "N" icon — never updated since scaffold)
  with `src/app/icon.tsx`** (Next's dynamic icon convention, rendered via `next/og`
  `ImageResponse`), tracing lucide-react's `heart-pulse` path so the browser tab matches the
  in-app logo. `ImageResponse`/satori can't parse `oklch()` — the two colors used (navy `#0c1628`,
  orange `#f2763c`) are the `--background`(dark)/`--primary` tokens pre-converted to hex by hand;
  if the palette in `globals.css` changes, this file goes stale silently (no type error) and needs
  updating by hand too.
- Touched `src/app/(patient)/layout.tsx` for the header/footer styling to match (cross-lane, kept
  minimal — just the two className changes that mirror the clinician layout, no patient-lane logic
  touched).
- **New stretch lane `lab` (2026-10-17) claims a subfolder here: `src/app/(clinician)/lab`** (Papiers
  autoresearch challenge, TASKS.md T-090 to T-093, gated until the main demo flow works — see
  `relay/lab.md`). Nothing built there yet. When it is, expect a new nav/page under this route group
  owned by the `lab` lane, not this one; flag it here again if the lab lane ends up touching anything
  outside that subfolder.
- **A live `/api/benchmark/run` call took ~60s against the shared Tiger Cloud seed when click-tested
  (not a timeout, just real: 25 patients x 6 vitals metrics x 5 warm runs, for 3 paths, plus a
  silence scan and a full engine re-run).** `benchmark-runner.tsx`'s "Running…" button state has no
  client-side timeout, so it's fine to leave as-is, but a screenshot/click-test script against this
  route needs a long poll window (~90s) or it'll report "didn't land" when it's actually still running
  — first attempt here used a 15s window and wrongly looked stuck.
- **The 3 benchmark paths came back nearly identical on this run (~3.3-3.5s each), not the
  "continuous aggregate way faster" story T-083 expects to tell.** Likely per-round-trip network
  latency to Tiger Cloud (150 queries/metric-patient pairs per path) dominating over the actual
  query-execution difference between the approaches, rather than a bug — T-010's benchmark route
  itself is core-owned and out of this lane's scope, so left as-is, but T-083 (pitch, rehearsing the
  demo numbers) should re-check this against a real run before claiming a dramatic speedup; the
  honest numbers are whatever the live run shows, not an assumed story.
- **Recharts `LabelList` text wraps onto two lines ("3536" / "ms") instead of one if the bar chart's
  right margin is too tight for the longest label.** First draft used `margin.right: 40` (copied from
  the vitals charts, which don't have an end-of-bar label) — the two longest bars' "ms" suffix wrapped
  to a second line, readable but sloppy, only visible in a screenshot. Fixed with `margin.right: 64`
  plus an `XAxis domain={[0, (max) => Math.ceil(max * 1.15)]}` so the longest bar doesn't run flush to
  the plot's right edge in the first place. Any future bar chart with an outside-the-bar value label
  should budget margin for the widest label text, not just the axis.
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
- 2026-10-17: T-048 done — `/benchmark` ("Synthetic scale test") page, closing out clinician's open
  tasks. Flipped the nav item from greyed "coming soon" to a real link. New `benchmark-runner.tsx`
  (client, on-demand "Run" button — same convention as `visit-summary.tsx`'s Generate, here because a
  cold run is a genuinely slow user-visible wait, not a paid call) posts to the already-built `POST
  /api/benchmark/run` (T-010) and renders its response as-is: 4 stat tiles (patients, vitals rows
  scanned, silent patients found, flags written) and a single-hue horizontal bar chart (dataviz skill:
  magnitude comparison -> bar, sequential one-hue color job, direct value-at-tip labels, no legend
  needed for one series) of median ms for the 3 OLS paths, labeled with when the run landed (the API
  itself returns no timestamp, so it's stamped client-side on response). Verified with `npm run lint`,
  `tsc --noEmit`, `npm test` (279 passing, no new tests — matches this lane's untested page/chart
  convention), and three live click-tests via headless Chrome against the Tiger Cloud seed (click Run
  -> wait for the real ~60s round trip -> screenshot, no console errors) — see Gotchas for the benchmark
  route's real latency, the flat (not dramatically different) numbers this seed's network RTT produces
  across the 3 paths, and a label-wrapping bug on the bar chart caught and fixed along the way.
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

- 2026-10-17 UI pass (pitch session, human request): `/benchmark` is now a "Population scan" page. Server component reading live data via `olsFitBatchSql` (BP systolic, 90-day window) and `listSilenceSql`, timed per query, with the old speed-check runner kept at the bottom (bars instead of a chart). Linked from a card on `/queue` and the clinician nav. Sunset gradient is now `body::before` in `globals.css`, with page content on a cream panel in both layouts. NOT run against the DB (no `.env.local` on that machine): open `/benchmark` once with keys and check the BP list and timings before the demo.
