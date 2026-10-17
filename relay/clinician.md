# Relay: clinician

<!-- Baton for the clinician lane. Any teammate's Claude session can pick this up with /pickup clinician.
     Keep sections short. Newest log entry on top. -->

## Status
T-041 done.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-042: patient detail route (e.g. `src/app/(clinician)/patients/[id]/page.tsx`) with lab trend
  charts — queue rows aren't links yet (see Gotchas), wire that click-through as part of T-042.
- T-043 after that: flag card with "why" panel, evidence list, citations, validate/dismiss.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
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
