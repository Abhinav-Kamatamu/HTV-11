# Relay: clinician

<!-- Baton for the clinician lane. Any teammate's Claude session can pick this up with /pickup clinician.
     Keep sections short. Newest log entry on top. -->

## Status
T-042, T-043, T-045 done (batched in one session — building the flag card for T-043 already
produced exactly what T-045 asks for, see Gotchas).

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-046: chart additions — Sen crossing-range band is already drawn for lab charts (T-042), so this
  is mainly CUSUM markers on the vitals/BP charts (none exist yet, only labs), metabolic syndrome
  3-of-5 chips with unknowns, and a STOP-Bang line. Needs a vitals-chart component alongside
  `lab-chart.tsx` (dense daily OLS series via `trends.ts`/`changepoint.ts`, not `labtrend.ts`).
- T-044: visit prep summary view, reading `visitSummary` from `src/ai` (T-026).
- T-047: "stopped logging" badge in the queue + stale-trend label on charts (`Flag.contributions[].stale`
  is already in the data from the engine; the flag card already shows "· stale" inline per row — a
  queue-level silence badge and a chart annotation are what's left).

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
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
