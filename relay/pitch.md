# Relay: pitch

<!-- Baton for the pitch lane. Any teammate's Claude session can pick this up with /pickup pitch.
     Keep sections short. Newest log entry on top. -->

## Status
T-080, T-081, T-083 done. T-082 `doing`: props made, backup recording not.
Devpost, DEV post, demo script, architecture SVG all in `pitch/`, numbers filled from live benchmark.

## In flight
T-082: done = `pitch/props/bp_monitor_141_88.png` and `sample_lab_report.pdf`. Not done = `backup_demo.mp4`
(human screen recording of the full run) and a test upload of both props on the live app.

## Next up
- Human: click through the 6 beats in `pitch/DEMO_SCRIPT.md` with a timer, record `backup_demo.mp4`, close T-082.
- Export `pitch/architecture.svg` to PNG for Devpost; add cover image to `pitch/DEV_POST.md`.
- After T-015 (GoDaddy domain) swap the IP link for the domain in `DEVPOST.md` and `DEV_POST.md`; after the event set `published: true` on the DEV post.

## Gotchas
<!-- Things the next session would otherwise waste time rediscovering. -->
- **Cross-lane touch (clinician session, 2026-10-17, commit `abac566`), human-requested project
  audit:** `pitch/DEMO_SCRIPT.md` beat 6 and `pitch/DEVPOST.md`'s care-team bullets were updated —
  both still described the old plain `/benchmark` speed-check page ("1,000 patients... 33ms") from
  before `/benchmark` was reworked into "Population scan" (live BP-trend + stopped-logging lists,
  commit `2573765`) earlier the same day. Beat 6's script now describes the actual page. Also
  updated the demo script's pre-show checklist numbers to match a timing fix landed the same
  session (the speed check's full engine re-run was blocking ~11.6s to compute a median it only
  ever showed once — see `relay/clinician.md` — now ~3.5s). **If anyone re-rehearses T-083 with a
  human click-through (still not done, see below), re-check these numbers are still accurate and
  the beat-6 line still matches whatever `/benchmark` looks like by then.**
- The audit this came out of flagged (not yet acted on, your call): T-082 has no backup recording
  yet, T-083 was never a full human click-through (API/curl-verified only), and the printed BP
  prop has only been tested digitally, never print-and-rephotograph. These are the real remaining
  podium-readiness risks, not anything code-side.
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
- 2026-10-17 14:53 · williamJpeng · T-080/081/083 done, T-082 props made, recording pending · 0 file(s) changed since last commit

- 2026-10-17, core lane note: T-015 (domain + HTTPS) is done — the live demo is now
  `https://cleanbillof.health`, not the bare IP. Updated the live-demo link in
  `pitch/DEVPOST.md` and `pitch/DEV_POST.md` (minimal cross-lane touch, CLAUDE.md §2). The old
  `http://155.138.148.86` link still resolves (nothing closed port 80), but use the domain going
  forward for the Devpost/DEV.to submissions and the live demo.

- 2026-10-17 T-081 done: `pitch/DEV_POST.md` drafted (published: false). Placeholders to fill: benchmark numbers (T-083), links, cover image. Publish after the event with the DEV challenge tag.

- 2026-10-17 T-080 done: `pitch/DEVPOST.md`, `pitch/architecture.svg` (export to PNG for Devpost), `pitch/DEMO_SCRIPT.md`. Rehearsal and benchmark numbers remain T-083.

- 2026-10-17 T-082 mostly done: `pitch/props/` has the BP monitor PNG and sample lab PDF (not yet test-uploaded through Gemini extraction). Backup screen recording is a human task after the T-083 rehearsal, so T-082 stays `doing`.

- 2026-10-17 T-083 done (partial rehearsal): measured live `POST /api/benchmark/run` on the 25-patient seed (12,900 rows: aggregate 33 ms, raw 35 ms, TS 116 ms, silence scan 54 ms, engine re-run 1.7 s) and put them in DEVPOST/DEV_POST/DEMO_SCRIPT. Queue API matches the demo cast (Walter urgent, Priya A, Marcus B, Daniel C). Not done: a human click-through of the UI, and a `--scale 1000` benchmark (it reseeds the shared DB, ~77s seed + 78s engine, must reseed back to 25 after; needs the team's OK).
