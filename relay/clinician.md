# Relay: clinician

<!-- Baton for the clinician lane. Any teammate's Claude session can pick this up with /pickup clinician.
     Keep sections short. Newest log entry on top. -->

## Status
T-040 done.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- T-041: Patient queue sorted by risk, severity filter (mock data until core's T-005 ranked-list
  wiring is pulled in) — replace `src/app/(clinician)/queue/page.tsx`'s placeholder.
- T-042 after that: patient detail route (e.g. `src/app/(clinician)/patients/[id]/page.tsx`) with
  lab trend charts.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
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
- 2026-10-17: T-040 done — clinician layout shell (header nav: Queue live, Benchmark stubbed),
  `/queue` placeholder page, shared `RoleSwitcher` component, root `/` turned into the role-chooser
  landing page. Verified with `npm run lint`, `tsc --noEmit`, and a headless-Chrome screenshot of
  `/` and `/queue` (nav highlighting correct, no console errors).
