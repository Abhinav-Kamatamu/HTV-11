# Relay: pitch

<!-- Baton for the pitch lane. Any teammate's Claude session can pick this up with /pickup pitch.
     Keep sections short. Newest log entry on top. -->

## Status
Docs updated (not a numbered task): Vultr usage expanded beyond bare hosting. T-080 through
T-083 still open and untouched.

## In flight
<!-- Task ID + 2-4 line plan, written BEFORE starting. Clear it when the task is done. -->
(none)

## Next up
<!-- The next 1-3 concrete steps, specific enough to start without asking anyone. -->
- See TASKS.md for T-080 through T-083 (Devpost draft, DEV.to write-up, demo props, rehearsal).
- T-083's Devpost draft should now also tell the Toronto-region + nightly-engine-job + (if built)
  object-storage/vector-store Vultr story from `docs/ARCHITECTURE.md`'s new "Vultr usage beyond
  hosting" section — it's the honest answer to "why Vultr" instead of "it was free".

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- Docs-only update (2026-10-17, no task id): at the human's request, reworked how the project
  uses Vultr so the MLH prize fits instead of being forced. `docs/ARCHITECTURE.md`'s Hosting row
  and new "Vultr usage beyond hosting" section, `docs/PRIZES.md`'s Vultr/GoDaddy rows, and
  `docs/DECISIONS.md` were updated; `TASKS.md` got T-006 reworded (Toronto region, patient data
  stays in Canada) plus three new rows: **T-013** (core, required) nightly cron re-running the
  engine for every patient — needed because silence detection and trend/projection aging are
  time-based, not event-based, so nothing else re-triggers them; **T-014** (core, optional)
  uploads on Vultr Object Storage if a Canadian region exists; **T-032** (engine, stretch, gated
  on confirming hackathon credits cover Serverless Inference and checking where it processes
  data) embeds `sources.ts` guideline excerpts in a Vultr vector store so the why panel can show
  the cited passage verbatim. No code written — T-013/T-014/T-032 are still `todo` for core/
  engine to pick up. This touched `docs/` (this lane's folder) plus `TASKS.md` (shared, not
  lane-exclusive); the new task rows assign work to core and engine, so flag it there too if
  either lane's session doesn't notice the new rows on its own.

## Log
<!-- scripts/handoff.sh appends entries here. -->

- 2026-10-17 T-081 done: `pitch/DEV_POST.md` drafted (published: false). Placeholders to fill: benchmark numbers (T-083), links, cover image. Publish after the event with the DEV challenge tag.

- 2026-10-17 T-080 done: `pitch/DEVPOST.md`, `pitch/architecture.svg` (export to PNG for Devpost), `pitch/DEMO_SCRIPT.md`. Rehearsal and benchmark numbers remain T-083.

- 2026-10-17 T-082 mostly done: `pitch/props/` has the BP monitor PNG and sample lab PDF (not yet test-uploaded through Gemini extraction). Backup screen recording is a human task after the T-083 rehearsal, so T-082 stays `doing`.

- 2026-10-17 T-083 done (partial rehearsal): measured live `POST /api/benchmark/run` on the 25-patient seed (12,900 rows: aggregate 33 ms, raw 35 ms, TS 116 ms, silence scan 54 ms, engine re-run 1.7 s) and put them in DEVPOST/DEV_POST/DEMO_SCRIPT. Queue API matches the demo cast (Walter urgent, Priya A, Marcus B, Daniel C). Not done: a human click-through of the UI, and a `--scale 1000` benchmark (it reseeds the shared DB, ~77s seed + 78s engine, must reseed back to 25 after; needs the team's OK).
